import { EmailMessage } from '../models/EmailMessage.js';
import { EmailThread } from '../models/EmailThread.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { Contact } from '../models/Contact.js';
import { Workspace } from '../models/Workspace.js';
import { sendGmail } from '../integrations/gmail/gmailService.js';
import { sendTransactionalEmail } from '../integrations/brevo/brevoService.js';
import { isSuppressed } from './suppressionService.js';
import { incrementUsage, assertWithinLimit } from './usageService.js';
import { buildVariableContext, renderTemplate } from '../utils/personalization.js';
import { logger } from '../utils/logger.js';
import { runAutomations } from './automationService.js';

export function buildIdempotencyKey({ workspaceId, contactId, campaignId, sequenceId, stepId, manualKey }) {
  if (manualKey) return `manual:${workspaceId}:${manualKey}`;
  const parts = [workspaceId, contactId, campaignId || sequenceId || 'direct', stepId || '0'];
  return parts.map(String).join(':');
}

function withinSendingWindow(settings, tz) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const hm = `${parts.hour}:${parts.minute}`;
    if (settings.skipWeekends && ['Sat', 'Sun'].includes(parts.weekday)) return false;
    const start = settings.sendingWindowStart || '00:00';
    const end = settings.sendingWindowEnd || '23:59';
    return hm >= start && hm <= end;
  } catch {
    return true;
  }
}

export function nextWindowTime(settings, tz) {
  // Next occurrence of window start in workspace timezone (approximation: +1h steps).
  const probe = new Date();
  for (let i = 0; i < 24 * 7; i++) {
    probe.setTime(probe.getTime() + 60 * 60 * 1000);
    if (withinSendingWindow(settings, tz, probe)) return new Date(probe);
  }
  return new Date(Date.now() + 60 * 60 * 1000);
}

async function checkAndBumpConnectionCounters(connection, limits) {
  const now = new Date();
  const resetAt = connection.countersResetAt || new Date(0);
  if (now.getUTCDate() !== resetAt.getUTCDate() || now - resetAt > 24 * 60 * 60 * 1000) {
    connection.sentToday = 0;
    connection.sentThisHour = 0;
    connection.countersResetAt = now;
  } else if (now.getUTCHours() !== resetAt.getUTCHours()) {
    connection.sentThisHour = 0;
    connection.countersResetAt = now;
  }
  if (limits.dailyLimit && connection.sentToday >= limits.dailyLimit) return { ok: false, reason: 'DAILY_LIMIT' };
  if (limits.hourlyLimit && connection.sentThisHour >= limits.hourlyLimit) return { ok: false, reason: 'HOURLY_LIMIT' };
  connection.sentToday += 1;
  connection.sentThisHour += 1;
  await connection.save();
  return { ok: true };
}

export async function recordEvent(workspaceId, { messageId, contactId, campaignId, sequenceId, provider, type, meta, dedupeKey, occurredAt }) {
  try {
    await EmailEvent.create({ workspaceId, messageId, contactId, campaignId, sequenceId, provider, type, meta, dedupeKey, occurredAt: occurredAt || new Date() });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // duplicate event
    throw err;
  }
}

/**
 * The single gate through which every automated outbound email flows.
 * Runs the full pre-send checklist, renders personalization, sends via the
 * requested provider and records the message + events. Idempotent by key.
 */
export async function sendTrackedEmail({
  workspaceId,
  contactId,
  campaignId,
  sequenceId,
  stepId,
  connectionId,
  provider,
  subject,
  bodyHtml,
  bodyText,
  threadId,          // gmail thread id to reply into
  replyToInternetMessageId,
  manualKey,
  senderUserId,
  extraVars = {},
  skipReplyCheck = false,
  scheduledFor = null,
}) {
  const idempotencyKey = buildIdempotencyKey({ workspaceId, contactId, campaignId, sequenceId, stepId, manualKey });

  // 3. idempotency — reserve the key atomically before any provider call
  const existing = await EmailMessage.findOne({ workspaceId, idempotencyKey });
  if (existing && !['failed', 'cancelled'].includes(existing.status)) {
    return { skipped: true, reason: 'DUPLICATE', message: existing };
  }

  const [contact, workspace] = await Promise.all([
    Contact.findOne({ _id: contactId, workspaceId }),
    Workspace.findById(workspaceId),
  ]);
  if (!contact) return { skipped: true, reason: 'CONTACT_NOT_FOUND' };

  // 1. suppression list
  if (await isSuppressed(workspaceId, contact.email)) {
    return { skipped: true, reason: 'SUPPRESSED' };
  }
  // 2. contact status
  if (['unsubscribed', 'bounced', 'invalid'].includes(contact.status) || contact.subscriptionStatus === 'unsubscribed') {
    return { skipped: true, reason: 'CONTACT_STATUS', status: contact.status };
  }
  // 8. already replied (campaign/sequence traffic only)
  if (!skipReplyCheck && (campaignId || sequenceId) && contact.lastRepliedAt) {
    const repliedRecently = await EmailMessage.exists({
      workspaceId, contactId, direction: 'inbound',
      ...(sequenceId ? { } : {}),
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 3600 * 1000) },
    });
    if (repliedRecently && sequenceId) return { skipped: true, reason: 'ALREADY_REPLIED' };
  }
  // 4. provider connection
  const connection = await EmailConnection.findOne({ _id: connectionId, workspaceId });
  if (!connection || connection.status === 'disconnected') {
    return { skipped: true, reason: 'CONNECTION_UNAVAILABLE' };
  }
  // 5. workspace usage limit
  try {
    await assertWithinLimit(workspaceId, 'emails_sent');
  } catch {
    return { skipped: true, reason: 'USAGE_LIMIT' };
  }
  // 6. sending window (only for scheduled/sequence traffic; manual sends go out immediately)
  const windowSettings = workspace?.settings || {};
  if ((campaignId || sequenceId) && !withinSendingWindow(windowSettings, workspace?.timezone)) {
    return { skipped: true, reason: 'OUTSIDE_WINDOW', retryAt: nextWindowTime(windowSettings, workspace?.timezone) };
  }
  // 7. per-connection daily/hourly limits (gmail only — brevo manages its own throughput)
  if (provider === 'gmail' && (campaignId || sequenceId)) {
    const gate = await checkAndBumpConnectionCounters(connection, {
      dailyLimit: windowSettings.dailySendLimit,
      hourlyLimit: windowSettings.hourlySendLimit,
    });
    if (!gate.ok) return { skipped: true, reason: gate.reason, retryAt: new Date(Date.now() + 30 * 60 * 1000) };
  }

  // Render personalization
  const ctx = buildVariableContext(contact, {
    sender_name: connection.displayName || connection.defaultSenderName || '',
    appointment_link: workspace?.bookingLink || '',
    ...extraVars,
  });
  const subjectR = renderTemplate(subject, ctx);
  const htmlR = renderTemplate(bodyHtml, ctx);
  const textR = renderTemplate(bodyText, ctx);

  // Reserve idempotency slot (or reuse failed one)
  let message = existing;
  const baseDoc = {
    workspaceId, contactId, campaignId, sequenceId, sequenceStepId: stepId || undefined,
    connectionId: connection._id, provider, direction: 'outbound',
    status: scheduledFor ? 'scheduled' : 'sending',
    from: { name: connection.displayName || connection.defaultSenderName || '', email: connection.email || connection.defaultSenderEmail },
    to: [{ name: contact.fullName, email: contact.email }],
    subject: subjectR.output, bodyHtml: htmlR.output, bodyText: textR.output,
    snippet: (textR.output || htmlR.output.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 140),
    idempotencyKey, scheduledAt: scheduledFor || new Date(), sentByUser: senderUserId,
    isRead: true,
  };
  if (message) {
    Object.assign(message, baseDoc);
    await message.save();
  } else {
    try {
      message = await EmailMessage.create(baseDoc);
    } catch (err) {
      if (err.code === 11000) return { skipped: true, reason: 'DUPLICATE' };
      throw err;
    }
  }

  if (scheduledFor && scheduledFor > new Date()) {
    await recordEvent(workspaceId, { messageId: message._id, contactId, campaignId, sequenceId, provider, type: 'scheduled' });
    return { scheduled: true, message };
  }

  // 9. send
  try {
    if (provider === 'gmail') {
      const res = await sendGmail(connection._id, {
        to: message.to,
        subject: message.subject,
        bodyHtml: message.bodyHtml,
        bodyText: message.bodyText,
        threadId,
        inReplyTo: replyToInternetMessageId,
        references: replyToInternetMessageId,
      });
      message.providerMessageId = res.providerMessageId;
      message.gmailThreadId = res.gmailThreadId;
      if (res.gmailThreadId && !contact.gmailThreadIds.includes(res.gmailThreadId)) {
        contact.gmailThreadIds.push(res.gmailThreadId);
      }
      // upsert thread record
      const threadDoc = await EmailThread.findOneAndUpdate(
        { workspaceId, connectionId: connection._id, gmailThreadId: res.gmailThreadId },
        {
          $set: {
            subject: message.subject, snippet: message.snippet, contactId: contact._id,
            campaignId, sequenceId, provider: 'gmail', lastMessageAt: new Date(), lastOutboundAt: new Date(),
          },
          $setOnInsert: { workspaceId, connectionId: connection._id, gmailThreadId: res.gmailThreadId },
          $inc: { messageCount: 1 },
        },
        { upsert: true, new: true }
      );
      message.threadId = threadDoc._id;
    } else if (provider === 'brevo') {
      const res = await sendTransactionalEmail(workspaceId, {
        to: message.to,
        subject: message.subject,
        htmlContent: message.bodyHtml || undefined,
        textContent: message.bodyText || undefined,
        headers: { 'X-EA-Message-Id': String(message._id) },
        tags: [campaignId ? `campaign:${campaignId}` : sequenceId ? `sequence:${sequenceId}` : 'direct'],
      });
      message.providerMessageId = res.brevoMessageId;
      message.brevoMessageId = res.brevoMessageId;
    } else {
      throw new Error(`Unknown provider ${provider}`);
    }

    message.status = 'sent';
    message.sentAt = new Date();
    await message.save();

    contact.status = ['new', 'invalid'].includes(contact.status) ? 'contacted' : contact.status;
    contact.lastContactedAt = new Date();
    await contact.save();

    // 10. record
    await incrementUsage(workspaceId, 'emails_sent');
    await recordEvent(workspaceId, { messageId: message._id, contactId, campaignId, sequenceId, provider, type: 'sent' });
    runAutomations(workspaceId, 'email_sent', { contact, message }).catch((e) => logger.warn(`automation email_sent: ${e.message}`));

    return { sent: true, message, missingVars: [...new Set([...subjectR.missing, ...htmlR.missing, ...textR.missing])] };
  } catch (err) {
    message.status = 'failed';
    message.failReason = err.message?.slice(0, 500);
    await message.save();
    await recordEvent(workspaceId, { messageId: message._id, contactId, campaignId, sequenceId, provider, type: 'failed', meta: { reason: err.message?.slice(0, 200) } });
    logger.error(`Send failed (${provider}) message ${message._id}: ${err.message}`);
    const out = { failed: true, message, error: err.message };
    if (err.code === 'GMAIL_TOKEN_EXPIRED') out.tokenExpired = true;
    return out;
  }
}
