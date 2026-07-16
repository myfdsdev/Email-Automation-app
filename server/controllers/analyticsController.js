import { catchAsync } from '../utils/catchAsync.js';
import { ok } from '../utils/response.js';
import {
  dashboardOverview, performanceSeries, providerComparison,
  replyClassificationBreakdown, teamAnalytics, integrationHealth,
} from '../services/analyticsService.js';
import { EmailCampaign } from '../models/EmailCampaign.js';
import { EmailSequence } from '../models/EmailSequence.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';

const range = (req) => ({ from: req.query.from, to: req.query.to });

export const overview = catchAsync(async (req, res) => {
  const data = await dashboardOverview(req.workspaceId, range(req));
  return ok(res, data);
});

export const performance = catchAsync(async (req, res) => {
  return ok(res, { series: await performanceSeries(req.workspaceId, range(req)) });
});

export const providers = catchAsync(async (req, res) => {
  return ok(res, { providers: await providerComparison(req.workspaceId, range(req)) });
});

export const replyBreakdown = catchAsync(async (req, res) => {
  return ok(res, { breakdown: await replyClassificationBreakdown(req.workspaceId, range(req)) });
});

export const team = catchAsync(async (req, res) => {
  const stats = await teamAnalytics(req.workspaceId, range(req));
  const members = await WorkspaceMember.find({ workspaceId: req.workspaceId, status: 'active' }).populate('userId', 'name email');
  const byId = Object.fromEntries(members.filter((m) => m.userId).map((m) => [String(m.userId._id), { name: m.userId.name, email: m.userId.email, role: m.role }]));
  const merge = {};
  const add = (rows, key) => rows.forEach((r) => {
    const id = String(r._id);
    merge[id] = merge[id] || { userId: id, ...byId[id], repliesHandled: 0, interested: 0, appointments: 0 };
    merge[id][key] = r.count;
  });
  add(stats.repliesHandled, 'repliesHandled');
  add(stats.interested, 'interested');
  add(stats.appointments, 'appointments');
  return ok(res, { members: Object.values(merge).filter((m) => m.name) });
});

export const health = catchAsync(async (req, res) => {
  return ok(res, { integrations: await integrationHealth(req.workspaceId) });
});

/** Dashboard side panels: active campaigns/sequences, recent replies, activity. */
export const dashboardPanels = catchAsync(async (req, res) => {
  const wid = req.workspaceId;
  const [activeCampaigns, activeSequences, recentReplies, recentActivity] = await Promise.all([
    EmailCampaign.find({ workspaceId: wid, status: { $in: ['running', 'scheduled', 'paused'] } }).sort('-updatedAt').limit(5)
      .select('name status provider stats schedule.scheduledAt'),
    EmailSequence.find({ workspaceId: wid, status: 'active' }).sort('-updatedAt').limit(5).select('name status stats'),
    EmailMessage.find({ workspaceId: wid, direction: 'inbound' }).sort('-createdAt').limit(6)
      .select('from subject snippet aiAnalysis.classification createdAt threadId contactId')
      .populate('contactId', 'firstName lastName email company'),
    EmailEvent.find({ workspaceId: wid }).sort('-occurredAt').limit(12)
      .populate('contactId', 'firstName lastName email')
      .populate('campaignId', 'name')
      .select('type occurredAt provider meta.url'),
  ]);
  return ok(res, { activeCampaigns, activeSequences, recentReplies, recentActivity });
});

/** Per-message activity timeline (tracking events). */
export const messageTimeline = catchAsync(async (req, res) => {
  const message = await EmailMessage.findOne({ _id: req.params.id, workspaceId: req.workspaceId })
    .select('subject to status provider sentAt deliveredAt firstOpenedAt firstClickedAt repliedAt openCount clickCount failReason');
  if (!message) return ok(res, { message: null, events: [] });
  const events = await EmailEvent.find({ workspaceId: req.workspaceId, messageId: message._id }).sort('occurredAt');
  return ok(res, { message, events });
});
