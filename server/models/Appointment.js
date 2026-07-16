import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
    title: { type: String, required: true },
    description: String,
    startsAt: { type: Date, required: true, index: true },
    endsAt: Date,
    location: String,
    meetingLink: String,
    status: { type: String, enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'], default: 'scheduled', index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign' },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence' },
    reminderSentAt: Date,
    confirmationSentAt: Date,
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

appointmentSchema.index({ workspaceId: 1, startsAt: 1 });
appointmentSchema.index({ workspaceId: 1, status: 1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
