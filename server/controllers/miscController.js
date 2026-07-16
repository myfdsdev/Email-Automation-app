import { Notification } from '../models/Notification.js';
import { Appointment } from '../models/Appointment.js';
import { Contact } from '../models/Contact.js';
import { FollowUp } from '../models/FollowUp.js';
import { SuppressionEntry } from '../models/SuppressionEntry.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { suppressContact, unsuppress } from '../services/suppressionService.js';
import { notify } from '../services/notificationService.js';
import { sendTrackedEmail } from '../services/emailSendService.js';
import { runAutomations } from '../services/automationService.js';
import { generateContent } from '../services/aiService.js';
import { audit } from '../services/auditService.js';

/* ---------------- notifications ---------------- */

export const listNotifications = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = { workspaceId: req.workspaceId, userId: req.user._id };
  if (req.query.unread === 'true') filter.isRead = false;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ workspaceId: req.workspaceId, userId: req.user._id, isRead: false }),
  ]);
  res.set('X-Unread-Count', String(unreadCount));
  return res.status(200).json({ success: true, data: { items, unreadCount, pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } } });
});

export const markNotificationRead = catchAsync(async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, workspaceId: req.workspaceId, userId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return ok(res, {});
});

export const markAllNotificationsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { workspaceId: req.workspaceId, userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return ok(res, {}, 'All caught up.');
});

/* ---------------- appointments ---------------- */

export const listAppointments = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { workspaceId: req.workspaceId };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.upcoming === 'true') filter.startsAt = { $gte: new Date() };
  if (req.role === 'sales') filter.assignedTo = req.user._id;
  const [items, total] = await Promise.all([
    Appointment.find(filter).sort(req.query.upcoming === 'true' ? 'startsAt' : '-startsAt').skip(skip).limit(limit)
      .populate('contactId', 'firstName lastName email company')
      .populate('assignedTo', 'name email'),
    Appointment.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const createAppointment = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.body.contactId, workspaceId: req.workspaceId });
  if (!contact) throw ApiError.notFound('Contact not found.');
  const appointment = await Appointment.create({ ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id });

  // Booking a meeting: stop sequences + update lead status
  const { stopEnrollment } = await import('../services/sequenceService.js');
  await stopEnrollment(req.workspaceId, null, contact._id, 'meeting_booked');
  if (!['converted'].includes(contact.status)) contact.status = 'meeting_booked';
  await contact.save();

  if (req.body.sendConfirmation) {
    const conn = await EmailConnection.findOne({ workspaceId: req.workspaceId, provider: 'brevo', status: 'connected' })
      || await EmailConnection.findOne({ workspaceId: req.workspaceId, provider: 'gmail', status: 'connected' });
    if (conn) {
      await sendTrackedEmail({
        workspaceId: req.workspaceId, contactId: contact._id, connectionId: conn._id, provider: conn.provider,
        subject: `Confirmed: ${appointment.title}`,
        bodyHtml: `<p>Hi {{first_name | default: "there"}},</p><p>Your appointment "<b>${appointment.title}</b>" is confirmed for <b>${new Date(appointment.startsAt).toUTCString()}</b>.</p>${appointment.meetingLink ? `<p>Join link: <a href="${appointment.meetingLink}">${appointment.meetingLink}</a></p>` : ''}<p>Talk soon!</p>`,
        manualKey: `appt-confirm:${appointment._id}`,
        senderUserId: req.user._id,
        skipReplyCheck: true,
      });
      appointment.confirmationSentAt = new Date();
      await appointment.save();
    }
  }

  if (appointment.assignedTo) {
    await notify(req.workspaceId, {
      userId: appointment.assignedTo, type: 'appointment_booked',
      title: `Meeting booked: ${appointment.title}`,
      body: `${contact.firstName || contact.email} on ${new Date(appointment.startsAt).toLocaleString()}`,
      link: '/appointments',
    });
  }
  runAutomations(req.workspaceId, 'appointment_booked', { contact }).catch(() => {});
  await audit(req, 'appointment.create', { resourceType: 'appointment', resourceId: appointment._id });
  return created(res, { appointment }, 'Appointment booked.');
});

export const updateAppointment = catchAsync(async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!appointment) throw ApiError.notFound('Appointment not found.');
  const prevStart = appointment.startsAt?.getTime();
  Object.assign(appointment, req.body);
  if (req.body.startsAt && new Date(req.body.startsAt).getTime() !== prevStart && appointment.status === 'scheduled') {
    appointment.status = 'rescheduled';
  }
  await appointment.save();
  return ok(res, { appointment }, 'Appointment updated.');
});

export const deleteAppointment = catchAsync(async (req, res) => {
  const appointment = await Appointment.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
  if (!appointment) throw ApiError.notFound('Appointment not found.');
  return ok(res, { appointment }, 'Appointment cancelled.');
});

/* ---------------- suppression ---------------- */

export const listSuppression = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { workspaceId: req.workspaceId };
  if (req.query.search) filter.email = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (req.query.reason) filter.reason = req.query.reason;
  const [items, total] = await Promise.all([
    SuppressionEntry.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('addedBy', 'name'),
    SuppressionEntry.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const addSuppression = catchAsync(async (req, res) => {
  const entry = await suppressContact(req.workspaceId, req.body.email, {
    reason: req.body.reason || 'manual_block',
    source: 'manual',
    note: req.body.note,
    addedBy: req.user._id,
  });
  await audit(req, 'suppression.add', { meta: { email: req.body.email } });
  return created(res, { entry }, 'Email suppressed. Active sequences stopped and scheduled sends cancelled.');
});

export const removeSuppression = catchAsync(async (req, res) => {
  const entry = await SuppressionEntry.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!entry) throw ApiError.notFound('Suppression entry not found.');
  await unsuppress(req.workspaceId, entry.email);
  await audit(req, 'suppression.remove', { meta: { email: entry.email } });
  return ok(res, {}, 'Email removed from suppression list.');
});

/* ---------------- follow-ups & calling integration ---------------- */

export const listFollowUps = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { workspaceId: req.workspaceId };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.type) filter.type = req.query.type;
  if (req.role === 'sales') filter.assignedTo = req.user._id;
  const [items, total] = await Promise.all([
    FollowUp.find(filter).sort('dueAt').skip(skip).limit(limit)
      .populate('contactId', 'firstName lastName email company phone')
      .populate('assignedTo', 'name'),
    FollowUp.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const createFollowUp = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.body.contactId, workspaceId: req.workspaceId });
  if (!contact) throw ApiError.notFound('Contact not found.');
  const followUp = await FollowUp.create({ ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id });
  return created(res, { followUp }, 'Follow-up created.');
});

export const updateFollowUp = catchAsync(async (req, res) => {
  const followUp = await FollowUp.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId },
    { $set: req.body },
    { new: true }
  );
  if (!followUp) throw ApiError.notFound('Follow-up not found.');
  return ok(res, { followUp }, 'Follow-up updated.');
});

/** Calling-app integration: receive an AI call outcome and continue the flow. */
export const receiveCallOutcome = catchAsync(async (req, res) => {
  const { externalCallId, followUpId, result, durationSec, recordingUrl, transcriptSummary, contactStatus, sendFollowUpEmail } = req.body;
  const followUp = followUpId
    ? await FollowUp.findOne({ _id: followUpId, workspaceId: req.workspaceId })
    : await FollowUp.findOne({ externalCallId, workspaceId: req.workspaceId });
  if (!followUp) throw ApiError.notFound('Call task not found.', 'CALL_TASK_NOT_FOUND');

  followUp.status = 'completed';
  followUp.callOutcome = { result, durationSec, recordingUrl, transcriptSummary, completedAt: new Date() };
  await followUp.save();

  const contact = await Contact.findById(followUp.contactId);
  if (contact && contactStatus) {
    contact.status = contactStatus;
    await contact.save();
  }
  if (contact) {
    runAutomations(req.workspaceId, 'ai_call_completed', { contact, callOutcome: followUp.callOutcome }).catch(() => {});
    if (sendFollowUpEmail) {
      const conn = await EmailConnection.findOne({ workspaceId: req.workspaceId, provider: 'gmail', status: 'connected' });
      if (conn) {
        await sendTrackedEmail({
          workspaceId: req.workspaceId, contactId: contact._id, connectionId: conn._id, provider: 'gmail',
          subject: 'Great speaking with you',
          bodyHtml: `<p>Hi {{first_name | default: "there"}},</p><p>Thanks for taking the time to speak with us today. ${transcriptSummary ? `To recap: ${transcriptSummary}` : ''}</p><p>Let me know if you have any questions.</p>`,
          manualKey: `call-followup:${followUp._id}`,
          skipReplyCheck: true,
        });
      }
    }
  }
  return ok(res, { followUp }, 'Call outcome recorded.');
});

/* ---------------- AI ---------------- */

export const aiGenerate = catchAsync(async (req, res) => {
  const { mode, prompt, context } = req.body;
  try {
    const result = await generateContent(req.workspaceId, mode, { prompt, context });
    return ok(res, { result });
  } catch (err) {
    if (err.code === 'AI_NOT_CONFIGURED') throw ApiError.serviceUnavailable(err.message, 'AI_NOT_CONFIGURED');
    throw err;
  }
});

/* ---------------- global search ---------------- */

export const globalSearch = catchAsync(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return ok(res, { contacts: [], campaigns: [], threads: [] });
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [contacts, campaigns, threads] = await Promise.all([
    Contact.find({ workspaceId: req.workspaceId, isDeleted: false, $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { company: rx }] })
      .limit(5).select('firstName lastName email company status'),
    (await import('../models/EmailCampaign.js')).EmailCampaign.find({ workspaceId: req.workspaceId, name: rx }).limit(5).select('name status provider'),
    (await import('../models/EmailThread.js')).EmailThread.find({ workspaceId: req.workspaceId, $or: [{ subject: rx }, { snippet: rx }] })
      .limit(5).select('subject snippet lastMessageAt'),
  ]);
  return ok(res, { contacts, campaigns, threads });
});

/* ---------------- scheduled emails (upcoming) ---------------- */

export const upcomingEmails = catchAsync(async (req, res) => {
  const items = await EmailMessage.find({
    workspaceId: req.workspaceId,
    status: { $in: ['queued', 'scheduled'] },
    direction: 'outbound',
  })
    .sort('scheduledAt')
    .limit(20)
    .select('to subject scheduledAt provider campaignId sequenceId status')
    .populate('campaignId', 'name')
    .populate('sequenceId', 'name');
  return ok(res, { items });
});
