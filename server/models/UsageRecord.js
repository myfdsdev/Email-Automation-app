import mongoose from 'mongoose';
import { USAGE_METRICS } from '../utils/constants.js';

/** Monthly usage counters per workspace, one doc per metric per period (YYYY-MM). */
const usageRecordSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    metric: { type: String, enum: USAGE_METRICS, required: true },
    period: { type: String, required: true }, // YYYY-MM
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

usageRecordSchema.index({ workspaceId: 1, metric: 1, period: 1 }, { unique: true });

export const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);
