import { Notification } from '../models/Notification.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';

/** Notify a single user, or all active workspace members with a role in `roles`. */
export async function notify(workspaceId, { userId, roles, type, title, body, link, meta }) {
  if (userId) {
    return Notification.create({ workspaceId, userId, type, title, body, link, meta });
  }
  const members = await WorkspaceMember.find({
    workspaceId,
    status: 'active',
    ...(roles?.length ? { role: { $in: roles } } : {}),
    userId: { $exists: true, $ne: null },
  }).select('userId');
  if (!members.length) return [];
  return Notification.insertMany(
    members.map((m) => ({ workspaceId, userId: m.userId, type, title, body, link, meta }))
  );
}
