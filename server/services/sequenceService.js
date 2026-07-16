import { EmailSequence } from '../models/EmailSequence.js';
import { SequenceStep } from '../models/SequenceStep.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { Contact } from '../models/Contact.js';
import { EmailTemplate } from '../models/EmailTemplate.js';
import { isSuppressed } from './suppressionService.js';
import { sendTrackedEmail } from './emailSendService.js';
import { logger } from '../utils/logger.js';

export async function enrollContacts(workspaceId, sequenceId, contactIds, enrolledBy) {
  const sequence = await EmailSequence.findOne({ _id: sequenceId, workspaceId });
  if (!sequence) throw new Error('Sequence not found');
  const firstStep = await SequenceStep.findOne({ sequenceId }).sort({ order: 1 });
  if (!firstStep) throw new Error('Sequence has no steps');

  let enrolled = 0;
  const results = { enrolled: 0, skipped: 0, reasons: {} };
  for (const contactId of contactIds) {
    const contact = await Contact.findOne({ _id: contactId, workspaceId, isDeleted: false });
    if (!contact) { results.skipped++; results.reasons.not_found = (results.reasons.not_found || 0) + 1; continue; }
    if (contact.subscriptionStatus === 'unsubscribed' || ['unsubscribed', 'bounced', 'invalid'].includes(contact.status)) {
      results.skipped++; results.reasons.unsubscribed = (results.reasons.unsubscribed || 0) + 1; continue;
    }
    if (await isSuppressed(workspaceId, contact.email)) {
      results.skipped++; results.reasons.suppressed = (results.reasons.suppressed || 0) + 1; continue;
    }
    const nextStepAt = new Date(Date.now() + (firstStep.delayDays * 24 + firstStep.delayHours) * 3600 * 1000);
    try {
      await SequenceEnrollment.create({
        workspaceId, sequenceId, contactId,
        status: 'active', currentStepOrder: 0,
        nextStepAt: nextStepAt < new Date() ? new Date() : nextStepAt,
        enrolledBy,
      });
      enrolled += 1;
    } catch (err) {
      if (err.code === 11000) { results.skipped++; results.reasons.already_enrolled = (results.reasons.already_enrolled || 0) + 1; }
      else throw err;
    }
  }
  if (enrolled) {
    await EmailSequence.updateOne({ _id: sequenceId }, { $inc: { 'stats.enrolled': enrolled, 'stats.active': enrolled } });
  }
  results.enrolled = enrolled;
  return results;
}

export async function stopEnrollment(workspaceId, sequenceId, contactId, reason = 'manual') {
  const filter = { workspaceId, contactId, status: { $in: ['active', 'paused'] } };
  if (sequenceId) filter.sequenceId = sequenceId;
  const enrollments = await SequenceEnrollment.find(filter);
  for (const e of enrollments) {
    e.status = 'stopped';
    e.stopReason = reason;
    e.stoppedAt = new Date();
    await e.save();
    await EmailSequence.updateOne({ _id: e.sequenceId }, { $inc: { 'stats.active': -1, 'stats.stopped': 1 } });
  }
  return enrollments.length;
}

/**
 * Processes a single due enrollment: evaluates skip conditions, sends the step
 * email (idempotent), advances the pointer and schedules the next step.
 */
export async function processEnrollment(enrollmentId) {
  const enrollment = await SequenceEnrollment.findById(enrollmentId);
  if (!enrollment || enrollment.status !== 'active') return { skipped: true, reason: 'NOT_ACTIVE' };
  if (enrollment.nextStepAt && enrollment.nextStepAt > new Date()) return { skipped: true, reason: 'NOT_DUE' };

  const [sequence, contact] = await Promise.all([
    EmailSequence.findById(enrollment.sequenceId),
    Contact.findById(enrollment.contactId),
  ]);
  if (!sequence || sequence.status !== 'active') return { skipped: true, reason: 'SEQUENCE_INACTIVE' };
  if (!contact) {
    enrollment.status = 'failed';
    await enrollment.save();
    return { failed: true, reason: 'CONTACT_MISSING' };
  }

  const steps = await SequenceStep.find({ sequenceId: sequence._id }).sort({ order: 1 });
  const nextStep = steps.find((s) => s.order > enrollment.currentStepOrder);
  if (!nextStep) {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
    await enrollment.save();
    await EmailSequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1, 'stats.completed': 1 } });
    const { runAutomations } = await import('./automationService.js');
    runAutomations(enrollment.workspaceId, 'sequence_completed', { contact }).catch(() => {});
    return { completed: true };
  }

  // Stop/skip conditions
  const stopChecks = [
    { cond: sequence.settings.stopOnReply && nextStep.conditions.skipIfReplied && contact.lastRepliedAt && enrollment.createdAt < contact.lastRepliedAt, reason: 'replied' },
    { cond: (sequence.settings.stopOnUnsubscribe || nextStep.conditions.skipIfUnsubscribed) && (contact.subscriptionStatus === 'unsubscribed' || contact.status === 'unsubscribed'), reason: 'unsubscribed' },
    { cond: (sequence.settings.stopOnBounce || nextStep.conditions.skipIfBounced) && contact.status === 'bounced', reason: 'bounced' },
    { cond: sequence.settings.stopOnMeetingBooked && nextStep.conditions.skipIfMeetingBooked && contact.status === 'meeting_booked', reason: 'meeting_booked' },
    { cond: contact.status === 'converted', reason: 'converted' },
  ];
  const hit = stopChecks.find((c) => c.cond);
  if (hit) {
    enrollment.status = 'stopped';
    enrollment.stopReason = hit.reason;
    enrollment.stoppedAt = new Date();
    await enrollment.save();
    await EmailSequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1, 'stats.stopped': 1 } });
    return { stopped: true, reason: hit.reason };
  }

  // Resolve content (step content overrides template)
  let subject = nextStep.subject;
  let bodyHtml = nextStep.bodyHtml;
  let bodyText = nextStep.bodyText;
  if (nextStep.templateId && !bodyHtml && !bodyText) {
    const template = await EmailTemplate.findById(nextStep.templateId);
    if (template) {
      subject = subject || template.subject;
      bodyHtml = template.bodyHtml;
      bodyText = template.bodyText;
    }
  }

  // Threading: follow-ups reply into the original Gmail thread when available
  const threadId = nextStep.replyToThread && enrollment.gmailThreadId ? enrollment.gmailThreadId : undefined;

  const result = await sendTrackedEmail({
    workspaceId: enrollment.workspaceId,
    contactId: contact._id,
    sequenceId: sequence._id,
    stepId: nextStep._id,
    connectionId: sequence.connectionId,
    provider: sequence.provider,
    subject: threadId && subject ? (subject.startsWith('Re:') ? subject : `Re: ${subject}`) : subject,
    bodyHtml,
    bodyText,
    threadId,
  });

  if (result.sent || result.skipped?.reason === 'DUPLICATE' || result.reason === 'DUPLICATE') {
    if (result.message?.gmailThreadId && !enrollment.gmailThreadId) {
      enrollment.gmailThreadId = result.message.gmailThreadId;
    }
    enrollment.currentStepOrder = nextStep.order;
    enrollment.stepHistory.push({ stepOrder: nextStep.order, status: 'sent', messageId: result.message?._id });
    const following = steps.find((s) => s.order > nextStep.order);
    if (following) {
      enrollment.nextStepAt = new Date(Date.now() + (following.delayDays * 24 + following.delayHours) * 3600 * 1000);
    } else {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();
      await EmailSequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1, 'stats.completed': 1 } });
    }
    await enrollment.save();
    await SequenceStep.updateOne({ _id: nextStep._id }, { $inc: { 'stats.sent': 1 } });
    return { sent: true, step: nextStep.order };
  }

  if (result.skipped) {
    if (['SUPPRESSED', 'CONTACT_STATUS', 'ALREADY_REPLIED'].includes(result.reason)) {
      enrollment.status = 'stopped';
      enrollment.stopReason = result.reason === 'ALREADY_REPLIED' ? 'replied' : 'suppressed';
      enrollment.stoppedAt = new Date();
      await enrollment.save();
      await EmailSequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1, 'stats.stopped': 1 } });
      await SequenceStep.updateOne({ _id: nextStep._id }, { $inc: { 'stats.skipped': 1 } });
      return { stopped: true, reason: result.reason };
    }
    // Temporary skip (window/limits) -> retry later
    enrollment.nextStepAt = result.retryAt || new Date(Date.now() + 30 * 60 * 1000);
    await enrollment.save();
    return { deferred: true, reason: result.reason };
  }

  if (result.failed) {
    enrollment.stepHistory.push({ stepOrder: nextStep.order, status: 'failed', note: result.error?.slice(0, 200) });
    // Retry up to 3 times per step, then stop the enrollment
    const failures = enrollment.stepHistory.filter((h) => h.stepOrder === nextStep.order && h.status === 'failed').length;
    if (failures >= 3) {
      enrollment.status = 'failed';
      await EmailSequence.updateOne({ _id: sequence._id }, { $inc: { 'stats.active': -1 } });
    } else {
      enrollment.nextStepAt = new Date(Date.now() + failures * 60 * 60 * 1000);
    }
    await enrollment.save();
    logger.warn(`Sequence step failed enrollment=${enrollment._id} step=${nextStep.order}: ${result.error}`);
    return { failed: true };
  }
  return result;
}

/** Finds due enrollments — called by the sequence worker on a schedule. */
export async function findDueEnrollments(limit = 200) {
  return SequenceEnrollment.find({ status: 'active', nextStepAt: { $lte: new Date() } })
    .sort({ nextStepAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
}
