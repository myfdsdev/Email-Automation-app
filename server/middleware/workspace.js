import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Workspace } from '../models/Workspace.js';
import { PERMISSIONS } from '../utils/constants.js';

/**
 * Resolves the active workspace from the `x-workspace-id` header (or ?workspaceId)
 * and verifies the authenticated user is an active member. All downstream queries
 * must filter by req.workspaceId — this is the tenancy boundary.
 */
export const requireWorkspace = catchAsync(async (req, _res, next) => {
  const workspaceId = req.headers['x-workspace-id'] || req.query.workspaceId;
  if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
    throw ApiError.badRequest('A valid workspace is required.', 'WORKSPACE_REQUIRED');
  }

  const member = await WorkspaceMember.findOne({
    workspaceId,
    userId: req.user._id,
    status: 'active',
  });
  if (!member) throw ApiError.forbidden('You are not a member of this workspace.', 'NOT_A_MEMBER');

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace || !workspace.isActive) throw ApiError.notFound('Workspace not found.', 'WORKSPACE_NOT_FOUND');

  req.workspace = workspace;
  req.workspaceId = workspace._id;
  req.member = member;
  req.role = member.role;
  next();
});

/** Permission gate, e.g. requirePermission('campaigns:manage'). */
export const requirePermission = (...perms) =>
  catchAsync(async (req, _res, next) => {
    const granted = PERMISSIONS[req.role] || [];
    const okAll = perms.every((p) => granted.includes(p));
    if (!okAll) throw ApiError.forbidden(`Your role (${req.role}) cannot perform this action.`, 'PERMISSION_DENIED');
    next();
  });

/** Sales members only see contacts/threads assigned to them. */
export function scopeToAssigned(req, filter = {}) {
  if (req.role === 'sales') return { ...filter, assignedTo: req.user._id };
  return filter;
}
