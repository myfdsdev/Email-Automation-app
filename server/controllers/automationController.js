import { Automation } from '../models/Automation.js';
import { AutomationExecution } from '../models/AutomationExecution.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from '../utils/constants.js';
import { audit } from '../services/auditService.js';

export const automationMeta = catchAsync(async (_req, res) => {
  return ok(res, { triggers: AUTOMATION_TRIGGERS, actions: AUTOMATION_ACTIONS });
});

export const listAutomations = catchAsync(async (req, res) => {
  const items = await Automation.find({ workspaceId: req.workspaceId }).sort('-updatedAt');
  return ok(res, { items });
});

export const createAutomation = catchAsync(async (req, res) => {
  const automation = await Automation.create({ ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id, status: 'draft' });
  await audit(req, 'automation.create', { resourceType: 'automation', resourceId: automation._id });
  return created(res, { automation }, 'Automation created.');
});

export const getAutomation = catchAsync(async (req, res) => {
  const automation = await Automation.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!automation) throw ApiError.notFound('Automation not found.');
  return ok(res, { automation });
});

export const updateAutomation = catchAsync(async (req, res) => {
  const automation = await Automation.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!automation) throw ApiError.notFound('Automation not found.');
  return ok(res, { automation }, 'Automation saved.');
});

export const deleteAutomation = catchAsync(async (req, res) => {
  const automation = await Automation.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!automation) throw ApiError.notFound('Automation not found.');
  await audit(req, 'automation.delete', { resourceType: 'automation', resourceId: req.params.id });
  return ok(res, {}, 'Automation deleted.');
});

export const setAutomationStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'paused', 'draft'].includes(status)) throw ApiError.badRequest('Invalid status.');
  const automation = await Automation.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!automation) throw ApiError.notFound('Automation not found.');
  if (status === 'active' && !automation.actions?.length) throw ApiError.badRequest('Add at least one action before activating.', 'NO_ACTIONS');
  automation.status = status;
  await automation.save();
  return ok(res, { automation }, `Automation ${status === 'active' ? 'activated' : status}.`);
});

export const listExecutions = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId };
  if (req.params.id) filter.automationId = req.params.id;
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    AutomationExecution.find(filter).sort('-createdAt').skip(skip).limit(limit)
      .populate('contactId', 'firstName lastName email')
      .populate('automationId', 'name trigger'),
    AutomationExecution.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});
