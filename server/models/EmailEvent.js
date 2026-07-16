import mongoose from 'mongoose';
import { EVENT_TYPES } from '../utils/constants.js';

const emailEventSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailMessage', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', index: true },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence' },
    provider: { type: String, enum: ['gmail', 'brevo', 'system'] },
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },
    occurredAt: { type: Date, default: Date.now, index: true },
    dedupeKey: { type: String },
    meta: {
      url: String,
      ip: String,
      userAgent: String,
      reason: String,
      brevoEventId: String,
    },
  },
  { timestamps: true }
);

emailEventSchema.index({ workspaceId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
emailEventSchema.index({ workspaceId: 1, type: 1, occurredAt: -1 });
emailEventSchema.index({ workspaceId: 1, occurredAt: -1 });

export const EmailEvent = mongoose.model('EmailEvent', emailEventSchema);
