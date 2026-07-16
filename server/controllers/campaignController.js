import { EmailCampaign } from '../models/EmailCampaign.js';
import { EmailTemplate } from '../models/EmailTemplate.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { reviewCampaign, startCampaign, pauseCampaign, resumeCampaign, cancelCampaign } from '../services/campaignService.js';
import { campaignAnalytics } from '../services/analyticsService.js';
import { audit } from '../services/auditService.js';

export const listCampaigns = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  else filter.status = { $ne: 'archived' };
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.search) filter.name = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [items, total] = await Promise.all([
    EmailCampaign.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('connectionId', 'email defaultSenderEmail provider status'),
    EmailCampaign.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const createCampaign = catchAsync(async (req, res) => {
  const body = { ...req.body, workspaceId: req.workspaceId, createdBy: req.user._id };
  if (body.connectionId) {
    const conn = await EmailConnection.findOne({ _id: body.connectionId, workspaceId: req.workspaceId, provider: body.provider });
    if (!conn) throw ApiError.badRequest('Selected sender account does not match the provider.', 'CONNECTION_MISMATCH');
  }
  if (body.content?.templateId) {
    const template = await EmailTemplate.findOne({ _id: body.content.templateId, workspaceId: req.workspaceId });
    if (template) {
      body.content.subject = body.content.subject || template.subject;
      body.content.bodyHtml = body.content.bodyHtml || template.bodyHtml;
      body.content.bodyText = body.content.bodyText || template.bodyText;
      await EmailTemplate.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
    }
  }
  const campaign = await EmailCampaign.create(body);
  await audit(req, 'campaign.create', { resourceType: 'campaign', resourceId: campaign._id });
  return created(res, { campaign }, 'Campaign draft created.');
});

export const getCampaign = catchAsync(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, workspaceId: req.workspaceId })
    .populate('connectionId', 'email defaultSenderEmail provider status')
    .populate('audience.listIds', 'name contactCount')
    .populate('audience.segmentIds', 'name estimatedCount');
  if (!campaign) throw ApiError.notFound('Campaign not found.', 'CAMPAIGN_NOT_FOUND');
  return ok(res, { campaign });
});

export const updateCampaign = catchAsync(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found.');
  if (['running', 'completed', 'cancelled'].includes(campaign.status)) {
    throw ApiError.badRequest(`A ${campaign.status} campaign cannot be edited.`, 'CAMPAIGN_LOCKED');
  }
  const patch = req.body;
  for (const key of ['name', 'description', 'type', 'provider', 'connectionId']) {
    if (patch[key] !== undefined) campaign[key] = patch[key];
  }
  for (const key of ['audience', 'content', 'schedule']) {
    if (patch[key]) Object.assign(campaign[key], patch[key]);
  }
  await campaign.save();
  return ok(res, { campaign }, 'Campaign saved.');
});

export const reviewCampaignHandler = catchAsync(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found.');
  const connection = campaign.connectionId ? await EmailConnection.findById(campaign.connectionId) : null;
  const review = await reviewCampaign(campaign);
  return ok(res, {
    ...review,
    sender: connection ? { email: connection.email || connection.defaultSenderEmail, status: connection.status, provider: connection.provider } : null,
    schedule: campaign.schedule,
    provider: campaign.provider,
  });
});

export const campaignAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!campaign) throw ApiError.notFound('Campaign not found.');

  switch (action) {
    case 'schedule': {
      if (!campaign.connectionId) throw ApiError.badRequest('Choose a sender account before scheduling.', 'SENDER_REQUIRED');
      if (!campaign.content.subject) throw ApiError.badRequest('Add a subject line before scheduling.', 'CONTENT_REQUIRED');
      if (!campaign.schedule.scheduledAt) throw ApiError.badRequest('Pick a date and time to schedule.', 'SCHEDULE_REQUIRED');
      campaign.schedule.sendNow = false;
      campaign.status = 'scheduled';
      await campaign.save();
      break;
    }
    case 'start': {
      if (!campaign.connectionId) throw ApiError.badRequest('Choose a sender account before starting.', 'SENDER_REQUIRED');
      if (!campaign.content.subject || (!campaign.content.bodyHtml && !campaign.content.bodyText)) {
        throw ApiError.badRequest('Campaign content is incomplete.', 'CONTENT_REQUIRED');
      }
      const result = await startCampaign(campaign._id);
      await audit(req, 'campaign.start', { resourceType: 'campaign', resourceId: campaign._id, meta: result });
      return ok(res, { result }, 'Campaign is now sending.');
    }
    case 'pause':
      if (campaign.status !== 'running' && campaign.status !== 'scheduled') throw ApiError.badRequest('Only running or scheduled campaigns can be paused.');
      await pauseCampaign(campaign);
      break;
    case 'resume':
      if (campaign.status !== 'paused') throw ApiError.badRequest('Only paused campaigns can be resumed.');
      await resumeCampaign(campaign);
      break;
    case 'cancel':
      if (['completed', 'cancelled'].includes(campaign.status)) throw ApiError.badRequest('Campaign is already finished.');
      await cancelCampaign(campaign);
      break;
    case 'archive':
      campaign.status = 'archived';
      await campaign.save();
      break;
    case 'duplicate': {
      const src = campaign.toObject();
      delete src._id; delete src.createdAt; delete src.updatedAt; delete src.stats;
      delete src.brevoCampaignId; delete src.startedAt; delete src.completedAt;
      const copy = await EmailCampaign.create({ ...src, name: `${campaign.name} (copy)`, status: 'draft', createdBy: req.user._id });
      return created(res, { campaign: copy }, 'Campaign duplicated.');
    }
    default:
      throw ApiError.badRequest(`Unknown action "${action}".`);
  }
  await audit(req, `campaign.${action}`, { resourceType: 'campaign', resourceId: campaign._id });
  return ok(res, { campaign }, `Campaign ${action}d.`.replace('ed.', 'ed.'));
});

export const campaignReport = catchAsync(async (req, res) => {
  const report = await campaignAnalytics(req.workspaceId, req.params.id);
  if (!report) throw ApiError.notFound('Campaign not found.');
  return ok(res, report);
});

export const campaignRecipients = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { workspaceId: req.workspaceId, campaignId: req.params.id, direction: 'outbound' };
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  const [items, total] = await Promise.all([
    EmailMessage.find(filter).sort('-createdAt').skip(skip).limit(limit)
      .select('to subject status sentAt deliveredAt firstOpenedAt openCount clickCount failReason contactId')
      .populate('contactId', 'firstName lastName email company status'),
    EmailMessage.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});
