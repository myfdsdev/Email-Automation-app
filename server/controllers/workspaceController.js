import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created } from '../utils/response.js';
import { createWorkspaceForUser } from './authController.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { sendInviteEmail } from '../services/mailerService.js';
import { audit } from '../services/auditService.js';
import { getPlanLimits } from '../services/usageService.js';

export const createWorkspace = catchAsync(async (req, res) => {
  const workspace = await createWorkspaceForUser(req.user, req.body.name);
  if (req.body.timezone) {
    workspace.timezone = req.body.timezone;
    await workspace.save();
  }
  return created(res, { workspace }, 'Workspace created.');
});

export const getWorkspace = catchAsync(async (req, res) => {
  return ok(res, { workspace: req.workspace, role: req.role });
});

export const updateWorkspace = catchAsync(async (req, res) => {
  const patch = req.body;
  if (patch.name) req.workspace.name = patch.name;
  if (patch.timezone) req.workspace.timezone = patch.timezone;
  for (const f of ['businessName', 'businessAddress', 'bookingLink']) {
    if (patch[f] !== undefined) req.workspace[f] = patch[f];
  }
  if (patch.settings) Object.assign(req.workspace.settings, patch.settings);
  await req.workspace.save();
  await audit(req, 'workspace.update', { resourceType: 'workspace', resourceId: req.workspaceId });
  return ok(res, { workspace: req.workspace }, 'Workspace settings saved.');
});

/* ---------------- team ---------------- */

export const listMembers = catchAsync(async (req, res) => {
  const members = await WorkspaceMember.find({ workspaceId: req.workspaceId })
    .populate('userId', 'name email avatarUrl lastLoginAt')
    .sort({ createdAt: 1 });
  return ok(res, { members });
});

export const inviteMember = catchAsync(async (req, res) => {
  const { email, role } = req.body;
  const { limits } = await getPlanLimits(req.workspaceId);
  const count = await WorkspaceMember.countDocuments({ workspaceId: req.workspaceId, status: { $ne: 'suspended' } });
  if (count >= limits.teamMembers) {
    throw new ApiError(402, 'Team member limit reached for your plan.', 'USAGE_LIMIT_REACHED');
  }
  const existing = await WorkspaceMember.findOne({ workspaceId: req.workspaceId, email });
  if (existing) throw ApiError.conflict('This person is already a member or has a pending invite.', 'ALREADY_MEMBER');

  const token = randomToken(24);
  const user = await User.findOne({ email });
  const member = await WorkspaceMember.create({
    workspaceId: req.workspaceId,
    userId: user?._id,
    email,
    role,
    status: 'invited',
    inviteToken: sha256(token),
    invitedBy: req.user._id,
  });
  await sendInviteEmail({ email, workspaceName: req.workspace.name, inviterName: req.user.name, token });
  await audit(req, 'team.invite', { resourceType: 'member', resourceId: member._id, meta: { email, role } });
  return created(res, { member }, `Invitation sent to ${email}.`);
});

export const acceptInvite = catchAsync(async (req, res) => {
  const { token } = req.body;
  const member = await WorkspaceMember.findOne({ inviteToken: sha256(token), status: 'invited' }).select('+inviteToken');
  if (!member) throw ApiError.badRequest('This invitation is invalid or was already used.', 'INVITE_INVALID');
  if (member.email !== req.user.email) {
    throw ApiError.forbidden(`This invite was sent to ${member.email}. Sign in with that email to accept.`, 'INVITE_EMAIL_MISMATCH');
  }
  member.userId = req.user._id;
  member.status = 'active';
  member.joinedAt = new Date();
  member.inviteToken = undefined;
  await member.save();
  const workspace = await Workspace.findById(member.workspaceId);
  return ok(res, { workspace: { id: workspace._id, name: workspace.name } }, `You joined ${workspace.name}.`);
});

export const updateMember = catchAsync(async (req, res) => {
  const member = await WorkspaceMember.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!member) throw ApiError.notFound('Member not found.');
  if (member.role === 'owner') throw ApiError.forbidden('The workspace owner role cannot be changed.', 'OWNER_IMMUTABLE');
  if (req.body.role) member.role = req.body.role;
  if (req.body.status) member.status = req.body.status;
  await member.save();
  await audit(req, 'team.update_member', { resourceType: 'member', resourceId: member._id, meta: req.body });
  return ok(res, { member }, 'Member updated.');
});

export const removeMember = catchAsync(async (req, res) => {
  const member = await WorkspaceMember.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!member) throw ApiError.notFound('Member not found.');
  if (member.role === 'owner') throw ApiError.forbidden('The workspace owner cannot be removed.', 'OWNER_IMMUTABLE');
  await member.deleteOne();
  await audit(req, 'team.remove_member', { resourceType: 'member', resourceId: req.params.id, meta: { email: member.email } });
  return ok(res, {}, 'Member removed.');
});
