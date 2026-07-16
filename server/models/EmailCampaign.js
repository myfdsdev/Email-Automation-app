import mongoose from 'mongoose';
import { CAMPAIGN_STATUSES } from '../utils/constants.js';

const emailCampaignSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: String,
    type: { type: String, enum: ['outreach', 'marketing', 'newsletter', 'transactional'], default: 'outreach' },
    provider: { type: String, enum: ['gmail', 'brevo'], required: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailConnection' },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },

    audience: {
      listIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
      segmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactSegment' }],
      excludeContactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
      excludeUnsubscribed: { type: Boolean, default: true },
      excludeBounced: { type: Boolean, default: true },
      excludeSuppressed: { type: Boolean, default: true },
      excludePreviouslyContacted: { type: Boolean, default: false },
    },

    content: {
      templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
      subject: { type: String, default: '' },
      bodyHtml: { type: String, default: '' },
      bodyText: { type: String, default: '' },
    },

    schedule: {
      sendNow: { type: Boolean, default: true },
      scheduledAt: Date,
      timezone: { type: String, default: 'UTC' },
      sendingWindowStart: { type: String, default: '09:00' },
      sendingWindowEnd: { type: String, default: '18:00' },
      skipWeekends: { type: Boolean, default: true },
      dailyLimit: { type: Number, default: 200 },
      hourlyLimit: { type: Number, default: 40 },
      delayBetweenEmailsSec: { type: Number, default: 45 },
    },

    stats: {
      recipients: { type: Number, default: 0 },
      queued: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      uniqueOpened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      uniqueClicked: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      interested: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
      spam: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      excluded: { type: Number, default: 0 },
    },

    brevoCampaignId: Number,
    startedAt: Date,
    completedAt: Date,
    lastProcessedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

emailCampaignSchema.index({ workspaceId: 1, status: 1 });
emailCampaignSchema.index({ workspaceId: 1, createdAt: -1 });
emailCampaignSchema.index({ status: 1, 'schedule.scheduledAt': 1 });

export const EmailCampaign = mongoose.model('EmailCampaign', emailCampaignSchema);
