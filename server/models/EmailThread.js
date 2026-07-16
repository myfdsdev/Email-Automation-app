import mongoose from 'mongoose';

const emailThreadSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailConnection', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign' },
    sequenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailSequence' },
    provider: { type: String, enum: ['gmail', 'brevo'], default: 'gmail' },
    gmailThreadId: { type: String, index: true },
    subject: String,
    snippet: String,
    participants: [{ name: String, email: String }],
    messageCount: { type: Number, default: 0 },
    unreadCount: { type: Number, default: 0 },
    hasAttachments: { type: Boolean, default: false },
    isStarred: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    labels: [String],
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    lastMessageAt: { type: Date, index: true },
    lastInboundAt: Date,
    lastOutboundAt: Date,
    needsResponse: { type: Boolean, default: false },
    lastClassification: String,
  },
  { timestamps: true }
);

emailThreadSchema.index({ workspaceId: 1, connectionId: 1, gmailThreadId: 1 }, { unique: true, partialFilterExpression: { gmailThreadId: { $type: 'string' } } });
emailThreadSchema.index({ workspaceId: 1, lastMessageAt: -1 });
emailThreadSchema.index({ workspaceId: 1, isArchived: 1, unreadCount: 1 });

export const EmailThread = mongoose.model('EmailThread', emailThreadSchema);
