import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: {
      type: String,
      enum: [
        'new_reply', 'interested_lead', 'appointment_booked', 'campaign_completed',
        'sequence_failed', 'gmail_disconnected', 'brevo_error', 'sending_limit_reached',
        'high_bounce_rate', 'spam_complaint', 'webhook_failure', 'worker_failure', 'team', 'system',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: String,
    link: String,
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

notificationSchema.index({ workspaceId: 1, userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
