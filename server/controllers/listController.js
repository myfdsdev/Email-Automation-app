import { ContactList } from '../models/ContactList.js';
import { ContactSegment } from '../models/ContactSegment.js';
import { Contact } from '../models/Contact.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { estimateSegmentCount, buildSegmentQuery } from '../services/segmentService.js';
import { syncListToBrevo } from '../integrations/brevo/brevoService.js';
import { audit } from '../services/auditService.js';

/* ---------------- static lists ---------------- */

export const listLists = catchAsync(async (req, res) => {
  const items = await ContactList.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
  return ok(res, { items });
});

export const createList = catchAsync(async (req, res) => {
  const list = await ContactList.create({ ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id });
  return created(res, { list }, 'List created.');
});

export const updateList = catchAsync(async (req, res) => {
  const list = await ContactList.findOneAndUpdate({ _id: req.params.id, workspaceId: req.workspaceId }, { $set: req.body }, { new: true });
  if (!list) throw ApiError.notFound('List not found.');
  return ok(res, { list }, 'List updated.');
});

export const deleteList = catchAsync(async (req, res) => {
  const list = await ContactList.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!list) throw ApiError.notFound('List not found.');
  await Contact.updateMany({ workspaceId: req.workspaceId, lists: list._id }, { $pull: { lists: list._id } });
  await audit(req, 'list.delete', { resourceType: 'list', resourceId: list._id });
  return ok(res, {}, 'List deleted.');
});

export const listMembersOf = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId, lists: req.params.id, isDeleted: false };
  const [items, total] = await Promise.all([
    Contact.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Contact.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const addContactsToList = catchAsync(async (req, res) => {
  const list = await ContactList.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!list) throw ApiError.notFound('List not found.');
  const r = await Contact.updateMany(
    { workspaceId: req.workspaceId, _id: { $in: req.body.contactIds } },
    { $addToSet: { lists: list._id } }
  );
  list.contactCount = await Contact.countDocuments({ workspaceId: req.workspaceId, lists: list._id, isDeleted: false });
  await list.save();
  return ok(res, { added: r.modifiedCount, contactCount: list.contactCount }, `Added ${r.modifiedCount} contacts.`);
});

export const removeContactsFromList = catchAsync(async (req, res) => {
  const list = await ContactList.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!list) throw ApiError.notFound('List not found.');
  const r = await Contact.updateMany(
    { workspaceId: req.workspaceId, _id: { $in: req.body.contactIds } },
    { $pull: { lists: list._id } }
  );
  list.contactCount = await Contact.countDocuments({ workspaceId: req.workspaceId, lists: list._id, isDeleted: false });
  await list.save();
  return ok(res, { removed: r.modifiedCount, contactCount: list.contactCount }, `Removed ${r.modifiedCount} contacts.`);
});

export const syncListWithBrevo = catchAsync(async (req, res) => {
  const result = await syncListToBrevo(req.workspaceId, req.params.id);
  await audit(req, 'list.brevo_sync', { resourceType: 'list', resourceId: req.params.id, meta: result });
  return ok(res, result, `Synced ${result.synced} contacts to Brevo.`);
});

/* ---------------- dynamic segments ---------------- */

export const listSegments = catchAsync(async (req, res) => {
  const items = await ContactSegment.find({ workspaceId: req.workspaceId }).sort({ createdAt: -1 });
  // refresh estimated counts lazily (cheap countDocuments per segment)
  for (const seg of items) {
    seg.estimatedCount = await estimateSegmentCount(req.workspaceId, seg.filters);
  }
  return ok(res, { items });
});

export const createSegment = catchAsync(async (req, res) => {
  const estimatedCount = await estimateSegmentCount(req.workspaceId, req.body.filters);
  const segment = await ContactSegment.create({ ...req.body, estimatedCount, workspaceId: req.workspaceId, createdBy: req.user._id });
  return created(res, { segment }, 'Segment created.');
});

export const updateSegment = catchAsync(async (req, res) => {
  const segment = await ContactSegment.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!segment) throw ApiError.notFound('Segment not found.');
  Object.assign(segment, req.body);
  segment.estimatedCount = await estimateSegmentCount(req.workspaceId, segment.filters);
  await segment.save();
  return ok(res, { segment }, 'Segment updated.');
});

export const deleteSegment = catchAsync(async (req, res) => {
  const segment = await ContactSegment.findOneAndDelete({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!segment) throw ApiError.notFound('Segment not found.');
  return ok(res, {}, 'Segment deleted.');
});

/** Live count + sample while building a segment. */
export const previewSegment = catchAsync(async (req, res) => {
  const filters = req.body.filters || [];
  const [count, sample] = await Promise.all([
    estimateSegmentCount(req.workspaceId, filters),
    Contact.find(buildSegmentQuery(req.workspaceId, filters)).limit(5).select('firstName lastName email company status'),
  ]);
  return ok(res, { count, sample });
});
