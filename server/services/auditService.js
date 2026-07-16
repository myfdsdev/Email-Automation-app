import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export async function audit(req, action, { resourceType, resourceId, meta } = {}) {
  try {
    await AuditLog.create({
      workspaceId: req.workspaceId,
      userId: req.user?._id,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : undefined,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
      meta,
    });
  } catch (err) {
    logger.warn(`Audit log write failed: ${err.message}`);
  }
}
