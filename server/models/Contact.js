import mongoose from 'mongoose';
import { CONTACT_STATUSES } from '../utils/constants.js';

const contactSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    company: String,
    jobTitle: String,
    website: String,
    industry: String,
    city: String,
    state: String,
    country: String,
    source: { type: String, default: 'manual' },
    status: { type: String, enum: CONTACT_STATUSES, default: 'new', index: true },
    leadScore: { type: Number, default: 0 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    tags: { type: [String], default: [], index: true },
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList', index: true }],
    customFields: { type: Map, of: String, default: {} },
    consentStatus: { type: String, enum: ['unknown', 'opted_in', 'opted_out'], default: 'unknown' },
    subscriptionStatus: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    notes: [
      {
        body: String,
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    lastContactedAt: Date,
    lastOpenedAt: Date,
    lastClickedAt: Date,
    lastRepliedAt: Date,
    nextFollowUpAt: Date,
    openCount: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    gmailThreadIds: { type: [String], default: [] },
    brevoContactId: String,
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
contactSchema.index({ workspaceId: 1, status: 1 });
contactSchema.index({ workspaceId: 1, createdAt: -1 });
contactSchema.index({ workspaceId: 1, gmailThreadIds: 1 });
contactSchema.index({ firstName: 'text', lastName: 'text', email: 'text', company: 'text' });

contactSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ') || this.email;
});

export const Contact = mongoose.model('Contact', contactSchema);
