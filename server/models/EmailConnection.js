import mongoose from 'mongoose';

/** Gmail OAuth connections and Brevo API connections (provider-discriminated). */
const emailConnectionSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: ['gmail', 'brevo'], required: true },
    status: { type: String, enum: ['connected', 'unhealthy', 'disconnected', 'expired'], default: 'connected' },
    lastError: String,

    // Gmail
    email: { type: String, lowercase: true, trim: true },
    googleAccountId: String,
    accessTokenEnc: { type: String, select: false },
    refreshTokenEnc: { type: String, select: false },
    tokenExpiresAt: Date,
    grantedScopes: [String],
    gmailHistoryId: String,
    gmailWatchExpiration: Date,
    lastSyncAt: Date,
    initialSyncDone: { type: Boolean, default: false },
    signature: String,
    displayName: String,

    // Brevo
    apiKeyEnc: { type: String, select: false },
    defaultSenderName: String,
    defaultSenderEmail: String,
    replyToEmail: String,
    senderId: String,
    webhookSecretEnc: { type: String, select: false },
    brevoAccountEmail: String,
    brevoPlan: String,

    // sending counters (rolling)
    sentToday: { type: Number, default: 0 },
    sentThisHour: { type: Number, default: 0 },
    countersResetAt: Date,
  },
  { timestamps: true }
);

emailConnectionSchema.index({ workspaceId: 1, provider: 1 });
emailConnectionSchema.index(
  { workspaceId: 1, provider: 1, email: 1 },
  { unique: true, partialFilterExpression: { provider: 'gmail' } }
);

emailConnectionSchema.methods.toSafeJSON = function () {
  const o = this.toObject({ virtuals: false });
  delete o.accessTokenEnc;
  delete o.refreshTokenEnc;
  delete o.apiKeyEnc;
  delete o.webhookSecretEnc;
  return o;
};

export const EmailConnection = mongoose.model('EmailConnection', emailConnectionSchema);
