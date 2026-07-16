import { sendCampaignEmail } from '../services/campaignService.js';
import { processEnrollment, findDueEnrollments } from '../services/sequenceService.js';
import { initialSync, incrementalSync } from '../integrations/gmail/gmailSync.js';
import { watchMailbox } from '../integrations/gmail/gmailService.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { processBrevoEvent } from '../services/webhookService.js';
import { notify } from '../services/notificationService.js';
import { logger } from '../utils/logger.js';

/** Job handlers shared by BullMQ workers and the inline dev queue. */

export async function emailSendProcessor(job) {
  if (job.name === 'campaign-email') {
    const result = await sendCampaignEmail(job.data);
    if (result.deferred) {
      // paused campaign — re-check in 5 minutes without consuming an attempt
      const { addJob, QUEUES } = await import('../queues/index.js');
      await addJob(QUEUES.EMAIL_SEND, 'campaign-email', job.data, {
        delay: 5 * 60 * 1000,
        jobId: `camp:${job.data.campaignId}:${job.data.contactId}:r${Date.now()}`,
      });
    }
    return summarize(result);
  }
  if (job.name === 'direct-email') {
    const { sendTrackedEmail } = await import('../services/emailSendService.js');
    return summarize(await sendTrackedEmail(job.data));
  }
  throw new Error(`Unknown email-send job ${job.name}`);
}

export async function sequenceProcessor(job) {
  if (job.name === 'process-due') {
    const due = await findDueEnrollments(300);
    let processed = 0;
    for (const e of due) {
      try {
        await processEnrollment(e._id);
        processed += 1;
      } catch (err) {
        logger.error(`Enrollment ${e._id} failed: ${err.message}`);
      }
    }
    return { due: due.length, processed };
  }
  if (job.name === 'process-one') {
    return summarize(await processEnrollment(job.data.enrollmentId));
  }
  throw new Error(`Unknown sequence job ${job.name}`);
}

export async function gmailSyncProcessor(job) {
  const { connectionId } = job.data;
  if (job.name === 'initial-sync') return initialSync(connectionId);
  if (job.name === 'incremental-sync') return incrementalSync(connectionId);
  if (job.name === 'sync-all') {
    const connections = await EmailConnection.find({ provider: 'gmail', status: { $in: ['connected', 'unhealthy'] } }).select('_id');
    for (const c of connections) {
      try { await incrementalSync(c._id); } catch (err) { logger.warn(`Sync ${c._id}: ${err.message}`); }
    }
    return { synced: connections.length };
  }
  throw new Error(`Unknown gmail-sync job ${job.name}`);
}

export async function gmailWatchProcessor(job) {
  if (job.name === 'renew-all') {
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    const connections = await EmailConnection.find({
      provider: 'gmail',
      status: { $in: ['connected', 'unhealthy'] },
      $or: [{ gmailWatchExpiration: { $lte: soon } }, { gmailWatchExpiration: null }],
    });
    let renewed = 0;
    for (const conn of connections) {
      try {
        const res = await watchMailbox(conn._id);
        if (res) {
          conn.gmailWatchExpiration = new Date(Number(res.expiration));
          if (res.historyId && !conn.gmailHistoryId) conn.gmailHistoryId = String(res.historyId);
          await conn.save();
          renewed += 1;
        }
      } catch (err) {
        logger.error(`Watch renewal failed for ${conn.email}: ${err.message}`);
        conn.status = 'unhealthy';
        conn.lastError = `Watch renewal failed: ${err.message}`;
        await conn.save();
        await notify(conn.workspaceId, {
          roles: ['owner', 'admin'],
          type: 'gmail_disconnected',
          title: `Gmail sync issue for ${conn.email}`,
          body: 'Push notifications could not be renewed. Open Integrations to reconnect.',
          link: '/integrations',
        });
      }
    }
    return { candidates: connections.length, renewed };
  }
  throw new Error(`Unknown gmail-watch job ${job.name}`);
}

export async function webhookProcessor(job) {
  const event = await WebhookEvent.findById(job.data.webhookEventId);
  if (!event) return { skipped: 'missing' };
  if (event.status === 'processed' || event.status === 'duplicate') return { skipped: event.status };
  event.attempts += 1;
  try {
    if (event.provider === 'brevo') await processBrevoEvent(event);
    event.status = 'processed';
    event.processedAt = new Date();
    await event.save();
    return { processed: true };
  } catch (err) {
    event.status = 'failed';
    event.error = err.message?.slice(0, 500);
    await event.save();
    throw err; // let BullMQ retry
  }
}

export async function automationProcessor(job) {
  const { runAutomations } = await import('../services/automationService.js');
  const { Contact } = await import('../models/Contact.js');
  const contact = job.data.contactId ? await Contact.findById(job.data.contactId) : null;
  await runAutomations(job.data.workspaceId, job.data.trigger, { ...job.data.ctx, contact });
  return { done: true };
}

export async function analyticsProcessor(job) {
  if (job.name === 'refresh-campaign-reports') {
    const { EmailCampaign } = await import('../models/EmailCampaign.js');
    const { getBrevoCampaignReport } = await import('../integrations/brevo/brevoService.js');
    const campaigns = await EmailCampaign.find({ provider: 'brevo', brevoCampaignId: { $exists: true }, status: { $in: ['running', 'scheduled'] } });
    for (const c of campaigns) {
      try {
        const report = await getBrevoCampaignReport(c.workspaceId, c.brevoCampaignId);
        c.stats.sent = report.sent;
        c.stats.delivered = report.delivered;
        c.stats.uniqueOpened = report.uniqueViews;
        c.stats.uniqueClicked = report.uniqueClicks;
        c.stats.bounced = report.softBounces + report.hardBounces;
        c.stats.unsubscribed = report.unsubscriptions;
        if (report.status === 'sent') { c.status = 'completed'; c.completedAt = new Date(); }
        await c.save();
      } catch (err) {
        logger.warn(`Brevo report refresh failed for campaign ${c._id}: ${err.message}`);
      }
    }
    return { refreshed: campaigns.length };
  }
  return { ok: true };
}

function summarize(result) {
  if (!result) return {};
  const { message, ...rest } = result;
  return { ...rest, messageId: message?._id };
}
