import { Contact } from '../models/Contact.js';

const FIELD_MAP = {
  status: 'status',
  tag: 'tags',
  tags: 'tags',
  source: 'source',
  industry: 'industry',
  city: 'city',
  country: 'country',
  company: 'company',
  job_title: 'jobTitle',
  assigned_to: 'assignedTo',
  consent_status: 'consentStatus',
  subscription_status: 'subscriptionStatus',
  lead_score: 'leadScore',
  open_count: 'openCount',
  click_count: 'clickCount',
  reply_count: 'replyCount',
  last_contacted_at: 'lastContactedAt',
  last_opened_at: 'lastOpenedAt',
  last_replied_at: 'lastRepliedAt',
  list: 'lists',
  email: 'email',
};

const NUMERIC = new Set(['leadScore', 'openCount', 'clickCount', 'replyCount']);
const DATE = new Set(['lastContactedAt', 'lastOpenedAt', 'lastRepliedAt', 'createdAt']);

function castValue(field, value) {
  if (NUMERIC.has(field)) return Number(value);
  if (DATE.has(field)) return new Date(value);
  return value;
}

/** Converts stored segment filters (AND) to a MongoDB query. */
export function buildSegmentQuery(workspaceId, filters = []) {
  const query = { workspaceId, isDeleted: false };
  const and = [];

  for (const f of filters) {
    const field = FIELD_MAP[f.field] || f.field;
    const value = castValue(field, f.value);
    switch (f.operator) {
      case 'equals': and.push({ [field]: value }); break;
      case 'not_equals': and.push({ [field]: { $ne: value } }); break;
      case 'contains': and.push({ [field]: { $regex: String(f.value), $options: 'i' } }); break;
      case 'in': and.push({ [field]: { $in: Array.isArray(f.value) ? f.value : [f.value] } }); break;
      case 'not_in': and.push({ [field]: { $nin: Array.isArray(f.value) ? f.value : [f.value] } }); break;
      case 'gt': and.push({ [field]: { $gt: value } }); break;
      case 'gte': and.push({ [field]: { $gte: value } }); break;
      case 'lt': and.push({ [field]: { $lt: value } }); break;
      case 'lte': and.push({ [field]: { $lte: value } }); break;
      case 'exists': and.push({ [field]: { $exists: true, $nin: [null, ''] } }); break;
      case 'not_exists': and.push({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] }); break;
      case 'before': and.push({ [field]: { $lt: new Date(f.value) } }); break;
      case 'after': and.push({ [field]: { $gt: new Date(f.value) } }); break;
      default: break;
    }
  }
  if (and.length) query.$and = and;
  return query;
}

export async function estimateSegmentCount(workspaceId, filters) {
  return Contact.countDocuments(buildSegmentQuery(workspaceId, filters));
}

export async function getSegmentContactIds(workspaceId, filters, limit = 100000) {
  const docs = await Contact.find(buildSegmentQuery(workspaceId, filters)).select('_id').limit(limit).lean();
  return docs.map((d) => d._id);
}
