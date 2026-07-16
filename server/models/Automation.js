import mongoose from 'mongoose';
import { AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from '../utils/constants.js';

const automationSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: String,
    status: { type: String, enum: ['active', 'paused', 'draft'], default: 'draft', index: true },
    trigger: { type: String, enum: AUTOMATION_TRIGGERS, required: true },
    conditions: [
      {
        field: { type: String, required: true },
        operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'in', 'gt', 'gte', 'lt', 'lte'], default: 'equals' },
        value: mongoose.Schema.Types.Mixed,
      },
    ],
    actions: [
      {
        type: { type: String, enum: AUTOMATION_ACTIONS, required: true },
        params: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
    runCount: { type: Number, default: 0 },
    lastRunAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

automationSchema.index({ workspaceId: 1, trigger: 1, status: 1 });

export const Automation = mongoose.model('Automation', automationSchema);
