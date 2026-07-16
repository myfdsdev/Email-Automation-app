import mongoose from 'mongoose';
import { ROLES } from '../utils/constants.js';

const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, default: 'viewer' },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'active' },
    inviteToken: { type: String, select: false },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: Date,
  },
  { timestamps: true }
);

workspaceMemberSchema.index({ workspaceId: 1, email: 1 }, { unique: true });
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 });

export const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);
