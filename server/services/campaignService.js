import { EmailCampaign } from '../models/EmailCampaign.js';
import { Contact } from '../models/Contact.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { buildSegmentQuery } from './segmentService.js';
import { ContactSegment } from '../models/ContactSegment.js';
import { filterSuppressed } from './suppressionService.js';
import { sendTrackedEmail } from './emailSendService.js';
import { extractVariables, buildVariableContext, renderTemplate } from '../utils/personalization.js';
import { createBrevoCampaign, sendBrevoCampaignNow, syncListToBrevo, updateBrevoCampaignStatus } from '../integrations/brevo/brevoService.js';
import { ContactList } from '../models/ContactList.js';
import { notify } from './notificationService.js';
import { logger } from '../utils/logger.js';

/** Resolves campaign audience -> deduped contact list with exclusion accounting. */
export async function resolveAudience(campaign) {
  const { workspaceId, audience } = campaign;
  const ids = new Set();

  if (audience.listIds?.length) {
    const docs = await Contact.find({ workspaceId, lists: { $in: audience.listIds }, isDeleted: false }).select('_id').lean();
    docs.forEach((d) => ids.add(String(d._id)));
  }
  for (const segId of audience.segmentIds || []) {
    const segment = await ContactSegment.findOne({ _id: segId, workspaceId });
    if (!segment) continue;
    const docs = await Contact.find(buildSegmentQuery(workspaceId, segment.filters)).select('_id').lean();
    docs.forEach((d) => ids.add(String(d._id)));
  }
  (audience.excludeContactIds || []).forEach((id) => ids.delete(String(id)));

  const contacts = await Contact.find({ _id: { $in: [...ids] }, workspaceId }).lean();
  const excluded = { unsubscribed: 0, bounced: 0, suppressed: 0, previouslyContacted: 0, invalid: 0 };
  let valid = [];

  const suppressedSet = audience.excludeSuppressed !== false
    ? await filterSuppressed(workspaceId, contacts.map((c) => c.email))
    : new Set();

  for (const c of contacts) {
    if (audience.excludeUnsubscribed !== false && (c.subscriptionStatus === 'unsubscribed' || c.status === 'unsubscribed')) { excluded.unsubscribed++; continue; }
    if (audience.excludeBounced !== false && ['bounced', 'invalid'].includes(c.status)) { excluded.bounced++; continue; }
    if (suppressedSet.has(c.email)) { excluded.suppressed++; continue; }
    if (audience.excludePreviouslyContacted && c.lastContactedAt) { excluded.previouslyContacted++; continue; }
    valid.push(c);
  }
  return { contacts: valid, excluded, totalMatched: contacts.length };
}

/** Pre-flight report for the Review step of the wizard. */
export async function reviewCampaign(campaign) {
  const { contacts, excluded, totalMatched } = await resolveAudience(campaign);
  const vars = [...new Set([...extractVariables(campaign.content.subject), ...extractVariables(campaign.content.bodyHtml || campaign.content.bodyText)])];
  const missingByVar = {};
  const sample = contacts.slice(0, 500);
  for (const c of sample) {
    const ctx = buildVariableContext(c);
    for (const v of vars) {
      if (['sender_name', 'appointment_link'].includes(v)) continue;
      if (ctx[v] === undefined || ctx[v] === '') missingByVar[v] = (missingByVar[v] || 0) + 1;
    }
  }
  const delaySec = campaign.schedule.delayBetweenEmailsSec || 45;
  const estimatedMinutes = campaign.provider === 'gmail' ? Math.ceil((contacts.length * delaySec) / 60) : 5;
  return {
    totalMatched,
    validRecipients: contacts.length,
    excluded,
    variables: vars,
    missingVariables: Object.entries(missingByVar).map(([variable, count]) => ({ variable, count, sampled: sample.length })),
    estimatedMinutes,
  };
}

/** Starts a campaign: gmail -> enqueue per-contact jobs; brevo -> native campaign. */
export async function startCampaign(campaignId) {
  const campaign = await EmailCampaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) return { skipped: 'ALREADY_RUNNING' };

  const { contacts, excluded } = await resolveAudience(campaign);
  campaign.stats.recipients = contacts.length;
  campaign.stats.excluded = Object.values(excluded).reduce((a, b) => a + b, 0);
  campaign.status = 'running';
  campaign.startedAt = campaign.startedAt || new Date();
  await campaign.save();

  if (campaign.provider === 'brevo' && campaign.type !== 'outreach') {
    // Native Brevo marketing campaign: sync audience list, create + send campaign
    try {
      let brevoListIds = [];
      for (const listId of campaign.audience.listIds || []) {
        const res = await syncListToBrevo(campaign.workspaceId, listId);
        brevoListIds.push(res.brevoListId);
      }
      if (!brevoListIds.length) {
        // fall back to a synthetic list built from resolved audience
        const list = await ContactList.create({ workspaceId: campaign.workspaceId, name: `Campaign ${campaign.name} ${Date.now()}` });
        await Contact.updateMany({ _id: { $in: contacts.map((c) => c._id) } }, { $addToSet: { lists: list._id } });
        const res = await syncListToBrevo(campaign.workspaceId, list._id);
        brevoListIds = [res.brevoListId];
      }
      const brevoCampaignId = await createBrevoCampaign(campaign.workspaceId, {
        name: `${campaign.name} [${campaign._id}]`,
        subject: campaign.content.subject,
        htmlContent: campaign.content.bodyHtml || `<div>${campaign.content.bodyText || ''}</div>`,
        listIds: brevoListIds,
        scheduledAt: campaign.schedule.sendNow ? undefined : campaign.schedule.scheduledAt,
        utmCampaign: String(campaign._id),
      });
      campaign.brevoCampaignId = brevoCampaignId;
      if (campaign.schedule.sendNow) await sendBrevoCampaignNow(campaign.workspaceId, brevoCampaignId);
      campaign.stats.queued = contacts.length;
      await campaign.save();
      return { provider: 'brevo', brevoCampaignId, recipients: contacts.length };
    } catch (err) {
      campaign.status = 'failed';
      await campaign.save();
      await notify(campaign.workspaceId, { roles: ['owner', 'admin'], type: 'brevo_error', title: 'Brevo campaign failed to start', body: err.message });
      throw err;
    }
  }

  // Gmail outreach (or brevo transactional fan-out): queue per-contact send jobs
  const { enqueueCampaignSends } = await import('../queues/index.js');
  const enqueued = await enqueueCampaignSends(campaign, contacts);
  campaign.stats.queued = enqueued;
  await campaign.save();
  return { provider: campaign.provider, queued: enqueued };
}

/** Sends one campaign email (executed inside the email worker). */
export async function sendCampaignEmail({ campaignId, contactId }) {
  const campaign = await EmailCampaign.findById(campaignId);
  if (!campaign) return { skipped: true, reason: 'CAMPAIGN_MISSING' };
  if (campaign.status === 'paused') return { deferred: true, reason: 'PAUSED' };
  if (['cancelled', 'archived', 'failed', 'completed'].includes(campaign.status)) {
    return { skipped: true, reason: `CAMPAIGN_${campaign.status.toUpperCase()}` };
  }

  const result = await sendTrackedEmail({
    workspaceId: campaign.workspaceId,
    contactId,
    campaignId: campaign._id,
    connectionId: campaign.connectionId,
    provider: campaign.provider,
    subject: campaign.content.subject,
    bodyHtml: campaign.content.bodyHtml,
    bodyText: campaign.content.bodyText,
  });

  if (result.sent) {
    campaign.stats.sent += 1;
    campaign.lastProcessedAt = new Date();
    if (campaign.stats.sent + campaign.stats.failed >= campaign.stats.queued && campaign.stats.queued > 0) {
      campaign.status = 'completed';
      campaign.completedAt = new Date();
      await notify(campaign.workspaceId, {
        roles: ['owner', 'admin'], type: 'campaign_completed',
        title: `Campaign "${campaign.name}" completed`,
        body: `${campaign.stats.sent} emails sent.`, link: `/campaigns/${campaign._id}`,
      });
    }
    await campaign.save();
  } else if (result.failed) {
    campaign.stats.failed += 1;
    await campaign.save();
  }
  return result;
}

export async function pauseCampaign(campaign) {
  campaign.status = 'paused';
  await campaign.save();
  if (campaign.brevoCampaignId) {
    try { await updateBrevoCampaignStatus(campaign.workspaceId, campaign.brevoCampaignId, 'suspended'); }
    catch (err) { logger.warn(`Brevo pause failed: ${err.message}`); }
  }
}

export async function resumeCampaign(campaign) {
  campaign.status = 'running';
  await campaign.save();
  if (campaign.brevoCampaignId) {
    try { await updateBrevoCampaignStatus(campaign.workspaceId, campaign.brevoCampaignId, 'queued'); }
    catch (err) { logger.warn(`Brevo resume failed: ${err.message}`); }
  } else {
    // Re-enqueue anything not yet attempted
    const { contacts } = await resolveAudience(campaign);
    const already = await EmailMessage.distinct('contactId', { campaignId: campaign._id });
    const alreadySet = new Set(already.map(String));
    const remaining = contacts.filter((c) => !alreadySet.has(String(c._id)));
    const { enqueueCampaignSends } = await import('../queues/index.js');
    await enqueueCampaignSends(campaign, remaining);
  }
}

export async function cancelCampaign(campaign) {
  campaign.status = 'cancelled';
  await campaign.save();
  await EmailMessage.updateMany(
    { campaignId: campaign._id, status: { $in: ['queued', 'scheduled'] } },
    { $set: { status: 'cancelled', failReason: 'Campaign cancelled' } }
  );
  if (campaign.brevoCampaignId) {
    try { await updateBrevoCampaignStatus(campaign.workspaceId, campaign.brevoCampaignId, 'suspended'); }
    catch (err) { logger.warn(`Brevo cancel failed: ${err.message}`); }
  }
}
