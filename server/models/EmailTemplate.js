import mongoose from 'mongoose';
import { TEMPLATE_CATEGORIES } from '../utils/constants.js';

const emailTemplateSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    category: { type: String, enum: TEMPLATE_CATEGORIES, default: 'cold_outreach' },
    subject: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    editorMode: { type: String, enum: ['rich', 'plain', 'html'], default: 'rich' },
    variables: { type: [String], default: [] },
    isArchived: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

emailTemplateSchema.index({ workspaceId: 1, category: 1 });
emailTemplateSchema.index({ workspaceId: 1, name: 1 });

export const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);
