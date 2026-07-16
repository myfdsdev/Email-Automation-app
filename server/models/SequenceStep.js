import mongoose from 'mongoose';

const sequenceStepSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence', required: true, index: true },
    order: { type: Number, required: true },
    name: { type: String, default: '' },
    subject: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    bodyText: { type: String, default: '' },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
    delayDays: { type: Number, default: 0 },
    delayHours: { type: Number, default: 0 },
    replyToThread: { type: Boolean, default: true },
    conditions: {
      skipIfReplied: { type: Boolean, default: true },
      skipIfMeetingBooked: { type: Boolean, default: true },
      skipIfUnsubscribed: { type: Boolean, default: true },
      skipIfBounced: { type: Boolean, default: true },
    },
    stats: {
      sent: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

sequenceStepSchema.index({ sequenceId: 1, order: 1 }, { unique: true });

export const SequenceStep = mongoose.model('SequenceStep', sequenceStepSchema);
