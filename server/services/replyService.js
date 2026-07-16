import { EmailMessage } from '../models/EmailMessage.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { EmailSequence } from '../models/EmailSequence.js';
import { EmailCampaign } from '../models/EmailCampaign.js';
import { EmailThread } from '../models/EmailThread.js';
import { classifyReply } from './aiService.js';
import { suppressContact } from './suppressionService.js';
import { notify } from './notificationService.js';
import { recordEvent } from './emailSendService.js';
import { runAutomations } from './automationService.js';
import { createGmailDraft } from '../integrations/gmail/gmailService.js';
import { generateContent } from './aiService.js';
import { Workspace } from '../models/Workspace.js';
import { logger } from '../utils/logger.js';

const STATUS_BY_CLASSIFICATION = {
  interested: 'interested',
  pricing_question: 'interested',
  more_information: 'interested',
  meeting_request: 'interested',
  referral: 'replied',
  not_interested: 'not_interested',
  unsubscribe: 'unsubscribed',
  complaint: 'not_interested',
};

/**
 * Full inbound-reply pipeline:
 * detect -> match campaign/sequence -> stop follow-ups -> classify -> update
 * contact -> suppression -> notify -> automations -> optional AI draft.
 */
export async function handleIncomingReply({ connection, message, thread, contact }) {
  const workspaceId = connection.workspaceId;

  // Match originating outbound message in the same Gmail thread
  const original = await EmailMessage.findOne({
    workspaceId,
    gmailThreadId: message.gmailThreadId,
    direction: 'outbound',
    _id: { $ne: message._id },
  }).sort({ createdAt: -1 });

  const campaignId = original?.campaignId;
  const sequenceId = original?.sequenceId;
  if (original) {
    message.campaignId = campaignId;
    message.sequenceId = sequenceId;
    await message.save();
    if (original.status !== 'replied') {
      original.status = 'replied';
      original.repliedAt = new Date();
      await original.save();
    }
  }

  // Stop sequences before anything else (never follow up after a reply)
  if (contact) {
    const stopped = await SequenceEnrollment.updateMany(
      { workspaceId, contactId: contact._id, status: { $in: ['active', 'paused'] } },
      { $set: { status: 'stopped', stopReason: 'replied', stoppedAt: new Date() } }
    );
    if (stopped.modifiedCount) {
      await EmailSequence.updateMany(
        { _id: { $in: await SequenceEnrollment.distinct('sequenceId', { workspaceId, contactId: contact._id, stopReason: 'replied' }) } },
        { $inc: { 'stats.active': -stopped.modifiedCount, 'stats.stopped': stopped.modifiedCount, 'stats.replied': 1 } }
      );
    }
  }

  // Classify
  const analysis = await classifyReply(workspaceId, {
    subject: message.subject,
    body: message.bodyText || message.bodyHtml?.replace(/<[^>]+>/g, ' ') || message.snippet,
    contactName: contact ? `${contact.firstName} ${contact.lastName}`.trim() : message.from?.name,
  });
  message.aiAnalysis = { ...analysis, analyzedAt: new Date() };
  message.status = 'replied';
  await message.save();

  if (thread) {
    thread.lastClassification = analysis.classification;
    thread.needsResponse = analysis.requiresHumanReply !== false && !analysis.outOfOffice;
    await thread.save();
  }

  // Unsubscribe requests: suppress IMMEDIATELY before any other action
  if (analysis.unsubscribeRequest && contact) {
    await suppressContact(workspaceId, contact.email, {
      reason: 'requested',
      source: 'reply_detection',
      contactId: contact._id,
      campaignId,
      messageId: message._id,
      note: 'Contact asked to stop receiving emails (detected in reply).',
    });
  }

  // Update contact
  if (contact) {
    contact.lastRepliedAt = new Date();
    contact.replyCount += 1;
    const mapped = STATUS_BY_CLASSIFICATION[analysis.classification];
    if (mapped && !['converted', 'meeting_booked', 'unsubscribed'].includes(contact.status)) {
      contact.status = mapped;
    } else if (!mapped && ['new', 'contacted', 'delivered', 'opened', 'clicked'].includes(contact.status)) {
      contact.status = 'replied';
    }
    if (['interested', 'meeting_request', 'pricing_question'].includes(analysis.classification)) {
      contact.leadScore = Math.min(100, (contact.leadScore || 0) + 25);
    }
    await contact.save();
  }

  // Events + campaign stats
  await recordEvent(workspaceId, {
    messageId: original?._id || message._id,
    contactId: contact?._id,
    campaignId,
    sequenceId,
    provider: 'gmail',
    type: 'replied',
    dedupeKey: `reply:${message.providerMessageId}`,
  });
  if (campaignId) {
    const inc = { 'stats.replied': 1 };
    if (['interested', 'meeting_request', 'pricing_question', 'more_information'].includes(analysis.classification)) inc['stats.interested'] = 1;
    await EmailCampaign.updateOne({ _id: campaignId }, { $inc: inc });
  }

  // Notifications
  const contactLabel = contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email : message.from?.email;
  await notify(workspaceId, {
    roles: ['owner', 'admin', 'sales'],
    type: ['interested', 'meeting_request', 'pricing_question'].includes(analysis.classification) ? 'interested_lead' : 'new_reply',
    title: ['interested', 'meeting_request', 'pricing_question'].includes(analysis.classification)
      ? `Interested lead: ${contactLabel}`
      : `New reply from ${contactLabel}`,
    body: analysis.summary,
    link: `/inbox?thread=${thread?._id || ''}`,
    meta: { classification: analysis.classification, messageId: message._id },
  });

  // Automations
  runAutomations(workspaceId, 'reply_received', { contact, message, analysis }).catch((e) =>
    logger.warn(`automation reply_received failed: ${e.message}`)
  );

  // AI suggested response -> saved as Gmail draft for human review (never auto-send by default)
  try {
    const workspace = await Workspace.findById(workspaceId);
    const wantsDraft = analysis.requiresHumanReply && !analysis.outOfOffice && !analysis.unsubscribeRequest;
    if (wantsDraft && process.env.OPENAI_API_KEY) {
      const gen = await generateContent(workspaceId, 'reply', {
        prompt: 'Draft a reply to this prospect email.',
        context: {
          incoming: (message.bodyText || message.snippet || '').slice(0, 2000),
          classification: analysis.classification,
          contact: contactLabel,
          bookingLink: workspace?.bookingLink || undefined,
        },
      });
      if (gen?.body) {
        await createGmailDraft(connection._id, {
          to: [message.from],
          subject: message.subject?.startsWith('Re:') ? message.subject : `Re: ${message.subject || ''}`,
          bodyText: gen.body,
          bodyHtml: `<div>${String(gen.body).replace(/\n/g, '<br/>')}</div>`,
          threadId: message.gmailThreadId,
          inReplyTo: message.internetMessageId,
          references: message.internetMessageId,
        });
      }
    }
  } catch (err) {
    logger.warn(`AI draft generation skipped: ${err.message}`);
  }

  return { analysis };
}
