import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { Contact } from '../models/Contact.js';
import { EmailCampaign } from '../models/EmailCampaign.js';
import { EmailSequence } from '../models/EmailSequence.js';
import { Automation } from '../models/Automation.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { BackgroundJobLog } from '../models/BackgroundJobLog.js';
import { SuppressionEntry } from '../models/SuppressionEntry.js';
import { UsageRecord } from '../models/UsageRecord.js';
import { Subscription } from '../models/Subscription.js';
import { AuditLog } from '../models/AuditLog.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { getQueueStats } from '../queues/index.js';
import { ApiError } from '../utils/ApiError.js';
import { PLANS } from '../utils/constants.js';

export const adminDashboard = catchAsync(async (_req, res) => {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [
    totalUsers, activeWorkspaces, emailsToday, failedToday, activeCampaigns,
    gmailDisconnections, brevoFailures, bounces30d, spam30d, sent30d, queueStats, pendingWebhooks,
  ] = await Promise.all([
    User.countDocuments({}),
    Workspace.countDocuments({ isActive: true }),
    EmailEvent.countDocuments({ type: 'sent', occurredAt: { $gte: dayStart } }),
    EmailEvent.countDocuments({ type: 'failed', occurredAt: { $gte: dayStart } }),
    EmailCampaign.countDocuments({ status: 'running' }),
    EmailConnection.countDocuments({ provider: 'gmail', status: { $in: ['expired', 'unhealthy', 'disconnected'] } }),
    EmailConnection.countDocuments({ provider: 'brevo', status: 'unhealthy' }),
    EmailEvent.countDocuments({ type: { $in: ['hard_bounce', 'soft_bounce'] }, occurredAt: { $gte: new Date(Date.now() - 30 * 864e5) } }),
    EmailEvent.countDocuments({ type: 'spam_complaint', occurredAt: { $gte: new Date(Date.now() - 30 * 864e5) } }),
    EmailEvent.countDocuments({ type: 'sent', occurredAt: { $gte: new Date(Date.now() - 30 * 864e5) } }),
    getQueueStats(),
    WebhookEvent.countDocuments({ status: { $in: ['received', 'queued', 'failed'] } }),
  ]);
  const jobAgg = await BackgroundJobLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const jobs = Object.fromEntries(jobAgg.map((j) => [j._id, j.count]));
  return ok(res, {
    totalUsers, activeWorkspaces, emailsToday, failedToday, activeCampaigns,
    gmailDisconnections, brevoFailures,
    bounceRate: sent30d ? Math.round((bounces30d / sent30d) * 1000) / 10 : 0,
    spamRate: sent30d ? Math.round((spam30d / sent30d) * 1000) / 10 : 0,
    pendingJobs: (jobs.queued || 0) + (jobs.active || 0) + (jobs.retrying || 0),
    failedJobs: jobs.failed || 0,
    pendingWebhooks,
    queues: queueStats,
  });
});

const simpleList = (Model, { populate = [], select, searchFields = [], defaultSort = '-createdAt', extraFilter } = {}) =>
  catchAsync(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25 });
    const filter = { ...(extraFilter ? extraFilter(req) : {}) };
    if (req.query.workspaceId) filter.workspaceId = req.query.workspaceId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.provider) filter.provider = req.query.provider;
    if (req.query.search && searchFields.length) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    let q = Model.find(filter).sort(defaultSort).skip(skip).limit(limit);
    if (select) q = q.select(select);
    for (const p of populate) q = q.populate(p.path, p.select);
    const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
    return paginated(res, { items, total, page, limit });
  });

export const adminUsers = simpleList(User, { searchFields: ['name', 'email'], select: '-refreshTokens' });
export const adminWorkspaces = simpleList(Workspace, { searchFields: ['name', 'slug'], populate: [{ path: 'owner', select: 'name email' }] });
export const adminConnections = simpleList(EmailConnection, {
  searchFields: ['email', 'defaultSenderEmail'],
  select: '-accessTokenEnc -refreshTokenEnc -apiKeyEnc -webhookSecretEnc',
  populate: [{ path: 'workspaceId', select: 'name' }],
});
export const adminContactsList = simpleList(Contact, { searchFields: ['email', 'firstName', 'lastName'], populate: [{ path: 'workspaceId', select: 'name' }] });
export const adminCampaigns = simpleList(EmailCampaign, { searchFields: ['name'], populate: [{ path: 'workspaceId', select: 'name' }] });
export const adminSequences = simpleList(EmailSequence, { searchFields: ['name'], populate: [{ path: 'workspaceId', select: 'name' }] });
export const adminAutomations = simpleList(Automation, { searchFields: ['name'], populate: [{ path: 'workspaceId', select: 'name' }] });
export const adminEmailLogs = simpleList(EmailMessage, {
  searchFields: ['subject', 'from.email'],
  select: 'workspaceId provider direction status subject from to sentAt failReason createdAt campaignId',
  populate: [{ path: 'workspaceId', select: 'name' }],
});
export const adminWebhooks = simpleList(WebhookEvent, { searchFields: ['eventType', 'eventId'] });
export const adminJobs = simpleList(BackgroundJobLog, { searchFields: ['name', 'queue', 'jobId'], extraFilter: (req) => (req.query.queue ? { queue: req.query.queue } : {}) });
export const adminSuppression = simpleList(SuppressionEntry, { searchFields: ['email'], populate: [{ path: 'workspaceId', select: 'name' }] });
export const adminAuditLogs = simpleList(AuditLog, { searchFields: ['action'], populate: [{ path: 'userId', select: 'name email' }, { path: 'workspaceId', select: 'name' }] });

export const adminUsage = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};
  if (req.query.period) filter.period = req.query.period;
  const [items, total] = await Promise.all([
    UsageRecord.find(filter).sort('-period -count').skip(skip).limit(limit).populate('workspaceId', 'name plan'),
    UsageRecord.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const adminPlans = catchAsync(async (_req, res) => {
  const counts = await Subscription.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]);
  return ok(res, {
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, workspaces: counts.find((c) => c._id === id)?.count || 0 })),
  });
});

export const adminPayments = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25 });
  const [items, total] = await Promise.all([
    Subscription.find({ plan: { $ne: 'free' } }).sort('-updatedAt').skip(skip).limit(limit).populate('workspaceId', 'name'),
    Subscription.countDocuments({ plan: { $ne: 'free' } }),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const adminUpdateUser = catchAsync(async (req, res) => {
  const { isActive, isPlatformAdmin } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (String(user._id) === String(req.user._id) && isActive === false) {
    throw ApiError.badRequest('You cannot deactivate your own account.', 'SELF_DEACTIVATE');
  }
  if (isActive !== undefined) user.isActive = isActive;
  if (isPlatformAdmin !== undefined) user.isPlatformAdmin = isPlatformAdmin;
  await user.save();
  return ok(res, { user: user.toSafeJSON() }, 'User updated.');
});

export const adminUpdateWorkspace = catchAsync(async (req, res) => {
  const { isActive, plan } = req.body;
  const workspace = await Workspace.findById(req.params.id);
  if (!workspace) throw ApiError.notFound('Workspace not found.');
  if (isActive !== undefined) workspace.isActive = isActive;
  if (plan && PLANS[plan]) {
    workspace.plan = plan;
    await Subscription.updateOne({ workspaceId: workspace._id }, { $set: { plan } }, { upsert: true });
  }
  await workspace.save();
  return ok(res, { workspace }, 'Workspace updated.');
});

export const adminRetryWebhook = catchAsync(async (req, res) => {
  const event = await WebhookEvent.findById(req.params.id);
  if (!event) throw ApiError.notFound('Webhook event not found.');
  const { enqueueWebhookEvent } = await import('../queues/index.js');
  event.status = 'queued';
  await event.save();
  await enqueueWebhookEvent(event._id);
  return ok(res, {}, 'Webhook event re-queued.');
});

export const adminSystem = catchAsync(async (_req, res) => {
  const queues = await getQueueStats();
  const mongoose = (await import('mongoose')).default;
  return ok(res, {
    node: process.version,
    uptimeSec: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    queues,
    env: { nodeEnv: process.env.NODE_ENV || 'development', workersEnabled: !!process.env.REDIS_URL },
  });
});
