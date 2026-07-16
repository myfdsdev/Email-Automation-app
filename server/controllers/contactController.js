import { Contact } from '../models/Contact.js';
import { ContactList } from '../models/ContactList.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { Appointment } from '../models/Appointment.js';
import { FollowUp } from '../models/FollowUp.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination, parseSort } from '../utils/pagination.js';
import { scopeToAssigned } from '../middleware/workspace.js';
import { suppressContact } from '../services/suppressionService.js';
import { runAutomations } from '../services/automationService.js';
import { getPlanLimits } from '../services/usageService.js';
import { audit } from '../services/auditService.js';
import { normalizeEmail } from '../utils/personalization.js';

function buildFilter(req) {
  const { search, status, tag, source, listId, assignedTo, subscription } = req.query;
  const filter = scopeToAssigned(req, { workspaceId: req.workspaceId, isDeleted: false });
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { company: rx }];
  }
  if (status) filter.status = { $in: String(status).split(',') };
  if (tag) filter.tags = { $in: String(tag).split(',') };
  if (source) filter.source = { $in: String(source).split(',') };
  if (listId) filter.lists = listId;
  if (assignedTo === 'me') filter.assignedTo = req.user._id;
  else if (assignedTo === 'unassigned') filter.assignedTo = null;
  else if (assignedTo) filter.assignedTo = assignedTo;
  if (subscription) filter.subscriptionStatus = subscription;
  return filter;
}

export const listContacts = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, ['createdAt', 'updatedAt', 'firstName', 'email', 'company', 'leadScore', 'lastContactedAt', 'lastRepliedAt', 'status']);
  const filter = buildFilter(req);
  const [items, total] = await Promise.all([
    Contact.find(filter).sort(sort).skip(skip).limit(limit).populate('assignedTo', 'name email').populate('lists', 'name'),
    Contact.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const contactFacets = catchAsync(async (req, res) => {
  const base = { workspaceId: req.workspaceId, isDeleted: false };
  const [statuses, tags, sources] = await Promise.all([
    Contact.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Contact.distinct('tags', base),
    Contact.distinct('source', base),
  ]);
  return ok(res, {
    statuses: Object.fromEntries(statuses.map((s) => [s._id, s.count])),
    tags: tags.sort(),
    sources: sources.filter(Boolean).sort(),
  });
});

export const createContact = catchAsync(async (req, res) => {
  const { limits } = await getPlanLimits(req.workspaceId);
  const count = await Contact.countDocuments({ workspaceId: req.workspaceId, isDeleted: false });
  if (count >= limits.contacts) throw new ApiError(402, 'Contact limit reached for your plan.', 'USAGE_LIMIT_REACHED');

  const body = { ...req.body, email: normalizeEmail(req.body.email), workspaceId: req.workspaceId, source: req.body.source || 'manual' };
  const existing = await Contact.findOne({ workspaceId: req.workspaceId, email: body.email });
  if (existing && !existing.isDeleted) throw ApiError.conflict('A contact with this email already exists.', 'CONTACT_EXISTS');
  let contact;
  if (existing) {
    Object.assign(existing, body, { isDeleted: false });
    contact = await existing.save();
  } else {
    contact = await Contact.create(body);
  }
  await syncListCounts(req.workspaceId, contact.lists);
  runAutomations(req.workspaceId, 'contact_created', { contact }).catch(() => {});
  await audit(req, 'contact.create', { resourceType: 'contact', resourceId: contact._id });
  return created(res, { contact }, 'Contact created.');
});

export const getContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOne(scopeToAssigned(req, { _id: req.params.id, workspaceId: req.workspaceId }))
    .populate('assignedTo', 'name email')
    .populate('lists', 'name')
    .populate('notes.author', 'name');
  if (!contact) throw ApiError.notFound('Contact not found.', 'CONTACT_NOT_FOUND');
  return ok(res, { contact });
});

export const updateContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!contact) throw ApiError.notFound('Contact not found.', 'CONTACT_NOT_FOUND');
  const prevStatus = contact.status;
  const patch = { ...req.body };
  if (patch.email) patch.email = normalizeEmail(patch.email);
  if (patch.customFields) {
    for (const [k, v] of Object.entries(patch.customFields)) contact.customFields.set(k, v);
    delete patch.customFields;
  }
  const prevTags = [...contact.tags];
  Object.assign(contact, patch);
  await contact.save();
  await syncListCounts(req.workspaceId, contact.lists);

  if (patch.status && patch.status !== prevStatus) {
    runAutomations(req.workspaceId, 'contact_status_changed', { contact }).catch(() => {});
  }
  const newTags = (contact.tags || []).filter((t) => !prevTags.includes(t));
  if (newTags.length) runAutomations(req.workspaceId, 'tag_added', { contact }).catch(() => {});
  return ok(res, { contact }, 'Contact updated.');
});

export const deleteContact = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!contact) throw ApiError.notFound('Contact not found.', 'CONTACT_NOT_FOUND');
  contact.isDeleted = true;
  await contact.save();
  await SequenceEnrollment.updateMany(
    { workspaceId: req.workspaceId, contactId: contact._id, status: { $in: ['active', 'paused'] } },
    { $set: { status: 'stopped', stopReason: 'manual', stoppedAt: new Date() } }
  );
  await audit(req, 'contact.delete', { resourceType: 'contact', resourceId: contact._id });
  return ok(res, {}, 'Contact deleted.');
});

export const bulkAction = catchAsync(async (req, res) => {
  const { ids, action, value } = req.body;
  const filter = { workspaceId: req.workspaceId, _id: { $in: ids } };
  let result = {};
  switch (action) {
    case 'delete':
      result = await Contact.updateMany(filter, { $set: { isDeleted: true } });
      break;
    case 'add_tag':
      result = await Contact.updateMany(filter, { $addToSet: { tags: String(value) } });
      break;
    case 'remove_tag':
      result = await Contact.updateMany(filter, { $pull: { tags: String(value) } });
      break;
    case 'add_to_list':
      result = await Contact.updateMany(filter, { $addToSet: { lists: value } });
      await syncListCounts(req.workspaceId, [value]);
      break;
    case 'remove_from_list':
      result = await Contact.updateMany(filter, { $pull: { lists: value } });
      await syncListCounts(req.workspaceId, [value]);
      break;
    case 'set_status':
      result = await Contact.updateMany(filter, { $set: { status: String(value) } });
      break;
    case 'assign':
      result = await Contact.updateMany(filter, { $set: { assignedTo: value || null } });
      break;
    case 'unsubscribe':
      result = await Contact.updateMany(filter, { $set: { subscriptionStatus: 'unsubscribed', status: 'unsubscribed', consentStatus: 'opted_out' } });
      break;
    case 'suppress': {
      const contacts = await Contact.find(filter).select('email _id');
      for (const c of contacts) {
        await suppressContact(req.workspaceId, c.email, { reason: 'manual_block', source: 'bulk_action', contactId: c._id, addedBy: req.user._id });
      }
      result = { modifiedCount: contacts.length };
      break;
    }
    default:
      throw ApiError.badRequest('Unknown bulk action.');
  }
  await audit(req, `contact.bulk_${action}`, { meta: { count: ids.length } });
  return ok(res, { affected: result.modifiedCount ?? 0 }, `Updated ${result.modifiedCount ?? 0} contacts.`);
});

export const addNote = catchAsync(async (req, res) => {
  const contact = await Contact.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!contact) throw ApiError.notFound('Contact not found.');
  contact.notes.unshift({ body: req.body.body, author: req.user._id });
  await contact.save();
  await contact.populate('notes.author', 'name');
  return ok(res, { notes: contact.notes }, 'Note added.');
});

/** Unified activity timeline: events + messages + enrollments + appointments + tasks. */
export const contactTimeline = catchAsync(async (req, res) => {
  const contactId = req.params.id;
  const contact = await Contact.findOne(scopeToAssigned(req, { _id: contactId, workspaceId: req.workspaceId }));
  if (!contact) throw ApiError.notFound('Contact not found.');

  const [events, messages, enrollments, appointments, followUps] = await Promise.all([
    EmailEvent.find({ workspaceId: req.workspaceId, contactId }).sort({ occurredAt: -1 }).limit(100).populate('campaignId', 'name').lean(),
    EmailMessage.find({ workspaceId: req.workspaceId, contactId }).sort({ createdAt: -1 }).limit(50)
      .select('direction subject snippet status provider createdAt sentAt aiAnalysis.classification campaignId sequenceId')
      .populate('campaignId', 'name').populate('sequenceId', 'name').lean(),
    SequenceEnrollment.find({ workspaceId: req.workspaceId, contactId }).populate('sequenceId', 'name').lean(),
    Appointment.find({ workspaceId: req.workspaceId, contactId }).sort({ startsAt: -1 }).lean(),
    FollowUp.find({ workspaceId: req.workspaceId, contactId }).sort({ dueAt: -1 }).limit(20).lean(),
  ]);
  return ok(res, { events, messages, enrollments, appointments, followUps });
});

export const exportContacts = catchAsync(async (req, res) => {
  const filter = buildFilter(req);
  const contacts = await Contact.find(filter).limit(20000).lean();
  const headers = ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'website', 'industry', 'city', 'state', 'country', 'source', 'status', 'leadScore', 'tags', 'subscriptionStatus', 'createdAt'];
  const csvEscape = (v) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join(';') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...contacts.map((c) => headers.map((h) => csvEscape(c[h])).join(','))].join('\n');
  await audit(req, 'contact.export', { meta: { count: contacts.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${Date.now()}.csv"`);
  return res.send(csv);
});

async function syncListCounts(workspaceId, listIds = []) {
  for (const id of listIds || []) {
    const count = await Contact.countDocuments({ workspaceId, lists: id, isDeleted: false });
    await ContactList.updateOne({ _id: id, workspaceId }, { $set: { contactCount: count } });
  }
}
