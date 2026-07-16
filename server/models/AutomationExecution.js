import mongoose from 'mongoose';

const automationExecutionSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    automationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation', required: true, index: true },
    trigger: String,
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    conditionsResult: { passed: Boolean, checked: [{ field: String, operator: String, expected: mongoose.Schema.Types.Mixed, actual: mongoose.Schema.Types.Mixed, passed: Boolean }] },
    actionsExecuted: [
      {
        type: String,
        status: { type: String, enum: ['success', 'failed', 'skipped'] },
        error: String,
        at: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ['success', 'partial', 'failed', 'skipped'], default: 'success', index: true },
    error: String,
    triggeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

automationExecutionSchema.index({ workspaceId: 1, createdAt: -1 });

export const AutomationExecution = mongoose.model('AutomationExecution', automationExecutionSchema);
