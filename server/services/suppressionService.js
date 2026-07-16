import { SuppressionEntry } from '../models/SuppressionEntry.js';
import { Contact } from '../models/Contact.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { normalizeEmail } from '../utils/personalization.js';
import { logger } from '../utils/logger.js';

/**
 * Adds an email to the workspace suppression list and enforces consequences:
 * stops active sequences, cancels scheduled emails, flips contact status.
 * Idempotent — safe to call repeatedly for the same email.
 */
export async function suppressContact(workspaceId, email, { reason, source = 'system', contactId, campaignId, messageId, note, addedBy } = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const entry = await SuppressionEntry.findOneAndUpdate(
    { workspaceId, email: normalized },
    { $setOnInsert: { reason: reason || 'manual_block', source, contactId, campaignId, messageId, note, addedBy } },
    { upsert: true, new: true }
  );

  const contact = contactId
    ? await Contact.findOne({ _id: contactId, workspaceId })
    : await Contact.findOne({ workspaceId, email: normalized });

  if (contact) {
    const statusMap = { unsubscribed: 'unsubscribed', requested: 'unsubscribed', spam_complaint: 'unsubscribed', hard_bounce: 'bounced', manual_block: contact.status };
    contact.subscriptionStatus = 'unsubscribed';
    contact.consentStatus = 'opted_out';
    if (statusMap[reason] && !['converted'].includes(contact.status)) contact.status = statusMap[reason];
    await contact.save();

    const stopReason = reason === 'hard_bounce' ? 'bounced' : reason === 'spam_complaint' ? 'spam_complaint' : 'suppressed';
    const enrollments = await SequenceEnrollment.find({ workspaceId, contactId: contact._id, status: { $in: ['active', 'paused'] } });
    for (const enrollment of enrollments) {
      enrollment.status = 'stopped';
      enrollment.stopReason = stopReason;
      enrollment.stoppedAt = new Date();
      await enrollment.save();
      const { EmailSequence } = await import('../models/EmailSequence.js');
      await EmailSequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.active': -1, 'stats.stopped': 1 } });
    }

    await EmailMessage.updateMany(
      { workspaceId, contactId: contact._id, status: { $in: ['queued', 'scheduled'] }, direction: 'outbound' },
      { $set: { status: 'cancelled', failReason: `Suppressed: ${reason}` } }
    );
  }

  logger.info(`Suppressed ${normalized} in workspace ${workspaceId} (${reason})`);
  return entry;
}

export async function isSuppressed(workspaceId, email) {
  const entry = await SuppressionEntry.findOne({ workspaceId, email: normalizeEmail(email) }).lean();
  return !!entry;
}

export async function filterSuppressed(workspaceId, emails) {
  const normalized = emails.map(normalizeEmail);
  const entries = await SuppressionEntry.find({ workspaceId, email: { $in: normalized } }).select('email').lean();
  return new Set(entries.map((e) => e.email));
}

export async function unsuppress(workspaceId, email) {
  return SuppressionEntry.deleteOne({ workspaceId, email: normalizeEmail(email) });
}
