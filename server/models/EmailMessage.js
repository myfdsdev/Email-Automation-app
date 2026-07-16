import mongoose from 'mongoose';
import { MESSAGE_STATUSES, REPLY_CLASSIFICATIONS } from '../utils/constants.js';

const emailMessageSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailThread', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', index: true },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence', index: true },
    sequenceStepId: { type: mongoose.Schema.Types.ObjectId, ref: 'SequenceStep' },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailConnection' },
    provider: { type: String, enum: ['gmail', 'brevo', 'system'], required: true },
    direction: { type: String, enum: ['outbound', 'inbound'], required: true, index: true },
    status: { type: String, enum: MESSAGE_STATUSES, default: 'queued', index: true },

    from: { name: String, email: String },
    to: [{ name: String, email: String }],
    cc: [{ name: String, email: String }],
    bcc: [{ name: String, email: String }],
    subject: String,
    bodyHtml: String,
    bodyText: String,
    snippet: String,
    attachments: [{ filename: String, mimeType: String, size: Number, attachmentId: String }],

    idempotencyKey: { type: String, index: true },
    providerMessageId: { type: String, index: true },
    gmailThreadId: { type: String, index: true },
    gmailLabelIds: [String],
    internetMessageId: String,
    inReplyTo: String,
    brevoMessageId: String,

    isRead: { type: Boolean, default: true },
    isStarred: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },

    scheduledAt: { type: Date, index: true },
    sentAt: Date,
    deliveredAt: Date,
    firstOpenedAt: Date,
    firstClickedAt: Date,
    repliedAt: Date,
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    failReason: String,

    aiAnalysis: {
      classification: { type: String, enum: REPLY_CLASSIFICATIONS },
      sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
      intent: String,
      requiresHumanReply: Boolean,
      unsubscribeRequest: Boolean,
      outOfOffice: Boolean,
      summary: String,
      suggestedAction: String,
      analyzedAt: Date,
    },
    sentByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

emailMessageSchema.index({ workspaceId: 1, provider: 1, providerMessageId: 1 }, { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } });
emailMessageSchema.index({ workspaceId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
emailMessageSchema.index({ workspaceId: 1, direction: 1, createdAt: -1 });
emailMessageSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 });
emailMessageSchema.index({ workspaceId: 1, 'aiAnalysis.classification': 1 });

export const EmailMessage = mongoose.model('EmailMessage', emailMessageSchema);
