import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, enum: ['free', 'starter', 'growth', 'scale'], default: 'free' },
    timezone: { type: String, default: 'UTC' },
    businessName: String,
    businessAddress: String,
    bookingLink: String,
    settings: {
      dailySendLimit: { type: Number, default: 200 },
      hourlySendLimit: { type: Number, default: 40 },
      sendingWindowStart: { type: String, default: '09:00' },
      sendingWindowEnd: { type: String, default: '18:00' },
      skipWeekends: { type: Boolean, default: true },
      autoReplyEnabled: { type: Boolean, default: false },
      autoReplySafeCategories: { type: [String], default: [] },
      trackOpens: { type: Boolean, default: true },
      trackClicks: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);
