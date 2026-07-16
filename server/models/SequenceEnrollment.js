import mongoose from 'mongoose';

const sequenceEnrollmentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence', required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'stopped', 'failed'],
      default: 'active',
      index: true,
    },
    currentStepOrder: { type: Number, default: 0 },
    nextStepAt: { type: Date, index: true },
    gmailThreadId: String,
    stopReason: {
      type: String,
      enum: ['replied', 'unsubscribed', 'bounced', 'spam_complaint', 'meeting_booked', 'converted', 'manual', 'suppressed', 'error', null],
      default: null,
    },
    stepHistory: [
      {
        stepOrder: Number,
        status: { type: String, enum: ['sent', 'skipped', 'failed'] },
        messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailMessage' },
        at: { type: Date, default: Date.now },
        note: String,
      },
    ],
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: Date,
    stoppedAt: Date,
  },
  { timestamps: true }
);

sequenceEnrollmentSchema.index({ sequenceId: 1, contactId: 1 }, { unique: true });
sequenceEnrollmentSchema.index({ status: 1, nextStepAt: 1 });
sequenceEnrollmentSchema.index({ workspaceId: 1, contactId: 1, status: 1 });

export const SequenceEnrollment = mongoose.model('SequenceEnrollment', sequenceEnrollmentSchema);
