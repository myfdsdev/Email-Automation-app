import mongoose from 'mongoose';

const backgroundJobLogSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    queue: { type: String, required: true, index: true },
    jobId: String,
    name: String,
    status: { type: String, enum: ['queued', 'active', 'completed', 'failed', 'retrying'], default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    data: mongoose.Schema.Types.Mixed,
    result: mongoose.Schema.Types.Mixed,
    error: String,
    startedAt: Date,
    finishedAt: Date,
    durationMs: Number,
  },
  { timestamps: true }
);

backgroundJobLogSchema.index({ queue: 1, createdAt: -1 });
backgroundJobLogSchema.index({ status: 1, createdAt: -1 });

export const BackgroundJobLog = mongoose.model('BackgroundJobLog', backgroundJobLogSchema);
