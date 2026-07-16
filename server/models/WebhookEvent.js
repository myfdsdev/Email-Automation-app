import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', index: true },
    provider: { type: String, enum: ['brevo', 'gmail', 'stripe', 'calling'], required: true, index: true },
    eventId: { type: String, index: true },
    eventType: String,
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['received', 'queued', 'processed', 'failed', 'duplicate', 'invalid'], default: 'received', index: true },
    error: String,
    attempts: { type: Number, default: 0 },
    processedAt: Date,
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } });
webhookEventSchema.index({ createdAt: -1 });

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
