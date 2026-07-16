import { EmailMessage } from '../models/EmailMessage.js';
import { EmailCampaign } from '../models/EmailCampaign.js';
import { Contact } from '../models/Contact.js';
import { recordEvent } from './emailSendService.js';
import { suppressContact } from './suppressionService.js';
import { notify } from './notificationService.js';
import { runAutomations } from './automationService.js';
import { normalizeEmail } from '../utils/personalization.js';
import { logger } from '../utils/logger.js';

/**
 * Brevo webhook event -> internal event pipeline.
 * Brevo event names: request/sent, delivered, opened/uniqueOpened/proxy_open,
 * click, softBounce, hardBounce, blocked, spam, unsubscribed, error, invalid_email
 */
const TYPE_MAP = {
  request: 'sent',
  sent: 'sent',
  delivered: 'delivered',
  opened: 'opened',
  unique_opened: 'opened',
  uniqueOpened: 'opened',
  proxy_open: 'opened',
  click: 'clicked',
  clicked: 'clicked',
  soft_bounce: 'soft_bounce',
  softBounce: 'soft_bounce',
  hard_bounce: 'hard_bounce',
  hardBounce: 'hard_bounce',
  blocked: 'blocked',
  spam: 'spam_complaint',
  complaint: 'spam_complaint',
  unsubscribed: 'unsubscribed',
  unsubscribe: 'unsubscribed',
  error: 'error',
  invalid_email: 'error',
};

const MESSAGE_STATUS = {
  delivered: 'delivered',
  opened: 'opened',
  clicked: 'clicked',
  soft_bounce: 'soft_bounce',
  hard_bounce: 'hard_bounce',
  blocked: 'blocked',
  spam_complaint: 'spam',
  unsubscribed: 'unsubscribed',
};

// Statuses ordered by progression; never downgrade (an open after a click stays clicked)
const PROGRESSION = ['queued', 'scheduled', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'replied'];

export async function processBrevoEvent(webhookEvent) {
  const p = webhookEvent.payload || {};
  const eventName = String(p.event || webhookEvent.eventType || '').trim();
  const type = TYPE_MAP[eventName];
  if (!type) {
    logger.warn(`Unknown Brevo event: ${eventName}`);
    return { ignored: eventName };
  }

  const email = normalizeEmail(p.email);
  const brevoMessageId = p['message-id'] || p.messageId;
  const workspaceId = webhookEvent.workspaceId;
  if (!workspaceId) throw new Error('Webhook event missing workspaceId');

  // Locate our message: transactional sends carry X-EA-Message-Id header; fall back to brevo message-id or campaign tag
  let message = null;
  const headerId = p['X-EA-Message-Id'] || p.tags?.find?.((t) => /^[0-9a-f]{24}$/.test(t));
  if (headerId) message = await EmailMessage.findOne({ _id: headerId, workspaceId });
  if (!message && brevoMessageId) message = await EmailMessage.findOne({ workspaceId, brevoMessageId: String(brevoMessageId) });
  if (!message && email) {
    message = await EmailMessage.findOne({ workspaceId, provider: 'brevo', 'to.email': email }).sort({ createdAt: -1 });
  }

  const contact = email ? await Contact.findOne({ workspaceId, email }) : null;
  const campaignId = message?.campaignId;

  // Idempotent event write (dedupe on brevo event identity)
  const dedupeKey = `brevo:${eventName}:${brevoMessageId || email}:${p.date || p.ts_event || p.ts || ''}${type === 'clicked' ? `:${p.link || ''}` : ''}`;
  const isNew = await recordEvent(workspaceId, {
    messageId: message?._id,
    contactId: contact?._id,
    campaignId,
    provider: 'brevo',
    type,
    dedupeKey,
    occurredAt: p.date ? new Date(p.date) : new Date(),
    meta: { url: p.link, reason: p.reason, brevoEventId: String(p.id || ''), ip: p.sending_ip },
  });
  if (!isNew) return { duplicate: true };

  // Message status progression + counters
  if (message) {
    const newStatus = MESSAGE_STATUS[type];
    if (newStatus) {
      const cur = PROGRESSION.indexOf(message.status);
      const nxt = PROGRESSION.indexOf(newStatus);
      const isTerminalBad = ['soft_bounce', 'hard_bounce', 'blocked', 'spam', 'unsubscribed'].includes(newStatus);
      if (isTerminalBad || nxt > cur) message.status = newStatus;
    }
    if (type === 'delivered' && !message.deliveredAt) message.deliveredAt = new Date();
    if (type === 'opened') {
      message.openCount += 1;
      if (!message.firstOpenedAt) message.firstOpenedAt = new Date();
    }
    if (type === 'clicked') {
      message.clickCount += 1;
      if (!message.firstClickedAt) message.firstClickedAt = new Date();
    }
    await message.save();
  }

  // Contact engagement + campaign stats
  if (contact) {
    if (type === 'delivered' && contact.status === 'contacted') contact.status = 'delivered';
    if (type === 'opened') {
      contact.openCount += 1;
      contact.lastOpenedAt = new Date();
      if (['contacted', 'delivered', 'new'].includes(contact.status)) contact.status = 'opened';
    }
    if (type === 'clicked') {
      contact.clickCount += 1;
      contact.lastClickedAt = new Date();
      if (['contacted', 'delivered', 'opened', 'new'].includes(contact.status)) contact.status = 'clicked';
    }
    await contact.save();
  }

  if (campaignId) {
    const incMap = {
      delivered: { 'stats.delivered': 1 },
      opened: message?.openCount === 1 ? { 'stats.opened': 1, 'stats.uniqueOpened': 1 } : { 'stats.opened': 1 },
      clicked: message?.clickCount === 1 ? { 'stats.clicked': 1, 'stats.uniqueClicked': 1 } : { 'stats.clicked': 1 },
      soft_bounce: { 'stats.bounced': 1 },
      hard_bounce: { 'stats.bounced': 1 },
      blocked: { 'stats.bounced': 1 },
      spam_complaint: { 'stats.spam': 1 },
      unsubscribed: { 'stats.unsubscribed': 1 },
    };
    if (incMap[type]) await EmailCampaign.updateOne({ _id: campaignId }, { $inc: incMap[type] });
  }

  // Compliance consequences
  if (type === 'hard_bounce' && email) {
    await suppressContact(workspaceId, email, { reason: 'hard_bounce', source: 'brevo_webhook', contactId: contact?._id, campaignId, messageId: message?._id, note: p.reason });
  }
  if (type === 'spam_complaint' && email) {
    await suppressContact(workspaceId, email, { reason: 'spam_complaint', source: 'brevo_webhook', contactId: contact?._id, campaignId, messageId: message?._id });
    await notify(workspaceId, { roles: ['owner', 'admin'], type: 'spam_complaint', title: 'Spam complaint received', body: `${email} marked a message as spam.` });
  }
  if (type === 'unsubscribed' && email) {
    await suppressContact(workspaceId, email, { reason: 'unsubscribed', source: 'brevo_webhook', contactId: contact?._id, campaignId, messageId: message?._id });
  }

  // Automation triggers
  const triggerMap = { delivered: 'email_delivered', opened: 'email_opened', clicked: 'link_clicked', hard_bounce: 'email_bounced', soft_bounce: 'email_bounced', unsubscribed: 'contact_unsubscribed' };
  if (triggerMap[type] && contact) {
    runAutomations(workspaceId, triggerMap[type], { contact, message }).catch(() => {});
  }

  return { processed: type };
}
