import { EmailSequence } from '../models/EmailSequence.js';
import { SequenceStep } from '../models/SequenceStep.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { Contact } from '../models/Contact.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { enrollContacts, stopEnrollment } from '../services/sequenceService.js';
import { sequenceAnalytics } from '../services/analyticsService.js';
import { getPlanLimits } from '../services/usageService.js';
import { audit } from '../services/auditService.js';

export const listSequences = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { workspaceId: req.workspaceId };
  if (req.query.status) filter.status = req.query.status;
  else filter.status = { $ne: 'archived' };
  const [items, total] = await Promise.all([
    EmailSequence.find(filter).sort('-updatedAt').skip(skip).limit(limit).populate('connectionId', 'email defaultSenderEmail provider status'),
    EmailSequence.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const createSequence = catchAsync(async (req, res) => {
  const sequence = await EmailSequence.create({ ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id });
  return created(res, { sequence }, 'Sequence created.');
});

export const getSequence = catchAsync(async (req, res) => {
  const sequence = await EmailSequence.findOne({ _id: req.params.id, workspaceId: req.workspaceId })
    .populate('connectionId', 'email defaultSenderEmail provider status');
  if (!sequence) throw ApiError.notFound('Sequence not found.');
  const steps = await SequenceStep.find({ sequenceId: sequence._id }).sort({ order: 1 });
  return ok(res, { sequence, steps });
});

export const updateSequence = catchAsync(async (req, res) => {
  const sequence = await EmailSequence.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found.');
  const patch = req.body;
  for (const key of ['name', 'description', 'provider', 'connectionId']) {
    if (patch[key] !== undefined) sequence[key] = patch[key];
  }
  if (patch.settings) Object.assign(sequence.settings, patch.settings);
  await sequence.save();
  return ok(res, { sequence }, 'Sequence saved.');
});

export const sequenceAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const sequence = await EmailSequence.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found.');

  if (action === 'activate') {
    const stepCount = await SequenceStep.countDocuments({ sequenceId: sequence._id });
    if (!stepCount) throw ApiError.badRequest('Add at least one step before activating.', 'NO_STEPS');
    if (!sequence.connectionId) throw ApiError.badRequest('Choose a sender account before activating.', 'SENDER_REQUIRED');
    const { limits } = await getPlanLimits(req.workspaceId);
    const active = await EmailSequence.countDocuments({ workspaceId: req.workspaceId, status: 'active' });
    if (active >= limits.activeSequences) throw new ApiError(402, 'Active sequence limit reached for your plan.', 'USAGE_LIMIT_REACHED');
    sequence.status = 'active';
  } else if (action === 'pause') {
    sequence.status = 'paused';
  } else if (action === 'archive') {
    sequence.status = 'archived';
    await SequenceEnrollment.updateMany(
      { sequenceId: sequence._id, status: 'active' },
      { $set: { status: 'stopped', stopReason: 'manual', stoppedAt: new Date() } }
    );
  } else {
    throw ApiError.badRequest(`Unknown action "${action}".`);
  }
  await sequence.save();
  await audit(req, `sequence.${action}`, { resourceType: 'sequence', resourceId: sequence._id });
  return ok(res, { sequence }, `Sequence ${action}d.`);
});

/* ---------------- steps ---------------- */

export const upsertStep = catchAsync(async (req, res) => {
  const sequence = await EmailSequence.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!sequence) throw ApiError.notFound('Sequence not found.');
  const { order } = req.body;
  const step = await SequenceStep.findOneAndUpdate(
    { sequenceId: sequence._id, order },
    { $set: { ...req.body, workspaceId: req.workspaceId, sequenceId: sequence._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return ok(res, { step }, `Step ${order} saved.`);
});

export const deleteStep = catchAsync(async (req, res) => {
  const step = await SequenceStep.findOneAndDelete({ _id: req.params.stepId, workspaceId: req.workspaceId, sequenceId: req.params.id });
  if (!step) throw ApiError.notFound('Step not found.');
  // Re-number subsequent steps
  await SequenceStep.updateMany(
    { sequenceId: req.params.id, order: { $gt: step.order } },
    { $inc: { order: -1 } }
  );
  return ok(res, {}, 'Step removed.');
});

/* ---------------- enrollments ---------------- */

export const enroll = catchAsync(async (req, res) => {
  const { contactIds = [], listIds = [] } = req.body;
  let ids = [...contactIds];
  if (listIds.length) {
    const fromLists = await Contact.find({ workspaceId: req.workspaceId, lists: { $in: listIds }, isDeleted: false }).select('_id').lean();
    ids.push(...fromLists.map((c) => String(c._id)));
  }
  ids = [...new Set(ids)];
  const result = await enrollContacts(req.workspaceId, req.params.id, ids, req.user._id);
  await audit(req, 'sequence.enroll', { resourceType: 'sequence', resourceId: req.params.id, meta: result });
  return ok(res, result, `Enrolled ${result.enrolled} contacts (${result.skipped} skipped).`);
});

export const listEnrollments = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId, sequenceId: req.params.id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    SequenceEnrollment.find(filter).sort('-createdAt').skip(skip).limit(limit)
      .populate('contactId', 'firstName lastName email company status'),
    SequenceEnrollment.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const enrollmentAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const enrollment = await SequenceEnrollment.findOne({ _id: req.params.enrollmentId, workspaceId: req.workspaceId });
  if (!enrollment) throw ApiError.notFound('Enrollment not found.');

  if (action === 'pause' && enrollment.status === 'active') {
    enrollment.status = 'paused';
  } else if (action === 'resume' && enrollment.status === 'paused') {
    enrollment.status = 'active';
    if (!enrollment.nextStepAt || enrollment.nextStepAt < new Date()) enrollment.nextStepAt = new Date();
  } else if (action === 'stop') {
    await stopEnrollment(req.workspaceId, enrollment.sequenceId, enrollment.contactId, 'manual');
    return ok(res, {}, 'Enrollment stopped.');
  } else if (action === 'restart') {
    enrollment.status = 'active';
    enrollment.currentStepOrder = 0;
    enrollment.stopReason = null;
    enrollment.nextStepAt = new Date();
    enrollment.stepHistory = [];
    await EmailSequence.updateOne({ _id: enrollment.sequenceId }, { $inc: { 'stats.active': 1 } });
  } else {
    throw ApiError.badRequest(`Cannot ${action} this enrollment in its current state.`);
  }
  await enrollment.save();
  return ok(res, { enrollment }, `Enrollment ${action}d.`);
});

export const sequenceReport = catchAsync(async (req, res) => {
  const report = await sequenceAnalytics(req.workspaceId, req.params.id);
  if (!report) throw ApiError.notFound('Sequence not found.');
  return ok(res, report);
});
