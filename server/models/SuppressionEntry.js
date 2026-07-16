import mongoose from 'mongoose';
import { SUPPRESSION_REASONS } from '../utils/constants.js';

const suppressionEntrySchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    reason: { type: String, enum: SUPPRESSION_REASONS, required: true },
    source: { type: String, default: 'system' },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailMessage' },
    note: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

suppressionEntrySchema.index({ workspaceId: 1, email: 1 }, { unique: true });

export const SuppressionEntry = mongoose.model('SuppressionEntry', suppressionEntrySchema);
