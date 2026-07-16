import mongoose from 'mongoose';

/** Manual follow-up tasks + AI-call tasks (calling integration ready). */
const followUpSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    type: { type: String, enum: ['email', 'call', 'ai_call', 'task'], default: 'task' },
    title: { type: String, required: true },
    notes: String,
    dueAt: { type: Date, index: true },
    status: { type: String, enum: ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled', 'failed'], default: 'pending', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // AI-call integration payloads
    callOutcome: {
      result: String,
      durationSec: Number,
      recordingUrl: String,
      transcriptSummary: String,
      completedAt: Date,
    },
    externalCallId: String,
    sourceAutomationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Automation' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

followUpSchema.index({ workspaceId: 1, status: 1, dueAt: 1 });

export const FollowUp = mongoose.model('FollowUp', followUpSchema);
