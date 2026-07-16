import mongoose from 'mongoose';

const emailSequenceSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: String,
    status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft', index: true },
    provider: { type: String, enum: ['gmail', 'brevo'], default: 'gmail' },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailConnection' },
    settings: {
      sendingWindowStart: { type: String, default: '09:00' },
      sendingWindowEnd: { type: String, default: '18:00' },
      skipWeekends: { type: Boolean, default: true },
      timezone: { type: String, default: 'UTC' },
      stopOnReply: { type: Boolean, default: true },
      stopOnMeetingBooked: { type: Boolean, default: true },
      stopOnUnsubscribe: { type: Boolean, default: true },
      stopOnBounce: { type: Boolean, default: true },
    },
    stats: {
      enrolled: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      stopped: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      meetings: { type: Number, default: 0 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

emailSequenceSchema.index({ workspaceId: 1, status: 1 });

export const EmailSequence = mongoose.model('EmailSequence', emailSequenceSchema);
