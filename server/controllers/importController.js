import crypto from 'crypto';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok } from '../utils/response.js';
import { parseImportFile, suggestMapping, validateImport, executeImport } from '../services/importService.js';
import { getPlanLimits } from '../services/usageService.js';
import { Contact } from '../models/Contact.js';
import { audit } from '../services/auditService.js';

/**
 * Import sessions are held in memory keyed by a random token (10 min TTL).
 * Files never touch disk; production deployments can swap this for Redis.
 */
const sessions = new Map();
const TTL = 10 * 60 * 1000;

function putSession(data) {
  const id = crypto.randomBytes(16).toString('hex');
  sessions.set(id, { ...data, expiresAt: Date.now() + TTL });
  for (const [k, v] of sessions) if (v.expiresAt < Date.now()) sessions.delete(k);
  return id;
}

function getSession(id, workspaceId) {
  const s = sessions.get(id);
  if (!s || s.expiresAt < Date.now()) throw ApiError.badRequest('Import session expired. Please upload the file again.', 'IMPORT_SESSION_EXPIRED');
  if (String(s.workspaceId) !== String(workspaceId)) throw ApiError.forbidden();
  return s;
}

/** Step 1: upload -> detect columns + suggested mapping + sample rows. */
export const uploadImportFile = catchAsync(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Please choose a CSV or Excel file.', 'FILE_REQUIRED');
  const { headers, rows } = parseImportFile(req.file.buffer, req.file.originalname);
  if (!headers.length || !rows.length) throw ApiError.badRequest('The file appears to be empty.', 'EMPTY_FILE');
  if (rows.length > 20000) throw ApiError.badRequest('Imports are limited to 20,000 rows per file.', 'TOO_MANY_ROWS');

  const sessionId = putSession({ workspaceId: req.workspaceId, headers, rows, filename: req.file.originalname });
  return ok(res, {
    sessionId,
    filename: req.file.originalname,
    headers,
    totalRows: rows.length,
    suggestedMapping: suggestMapping(headers),
    sampleRows: rows.slice(0, 5),
  });
});

/** Step 2: validate mapping -> duplicate/suppression/invalid report. */
export const validateImportSession = catchAsync(async (req, res) => {
  const { sessionId, mapping } = req.body;
  if (!sessionId || !Array.isArray(mapping)) throw ApiError.badRequest('sessionId and mapping are required.');
  const session = getSession(sessionId, req.workspaceId);
  const { summary, parsed } = await validateImport(req.workspaceId, { headers: session.headers, rows: session.rows, mapping });

  const { limits } = await getPlanLimits(req.workspaceId);
  const existing = await Contact.countDocuments({ workspaceId: req.workspaceId, isDeleted: false });
  const overLimit = existing + summary.valid > limits.contacts;

  session.parsed = parsed;
  session.mapping = mapping;
  return ok(res, {
    summary,
    overLimit,
    planLimit: limits.contacts,
    existingContacts: existing,
    preview: parsed.slice(0, 20).map((p) => ({ status: p.status, email: p.record.email, firstName: p.record.firstName, lastName: p.record.lastName, company: p.record.company })),
  });
});

/** Step 3: confirm -> execute import. */
export const confirmImport = catchAsync(async (req, res) => {
  const { sessionId, listIds = [], updateExisting = true } = req.body;
  const session = getSession(sessionId, req.workspaceId);
  if (!session.parsed) throw ApiError.badRequest('Validate the mapping before confirming the import.', 'NOT_VALIDATED');

  const { limits } = await getPlanLimits(req.workspaceId);
  const existing = await Contact.countDocuments({ workspaceId: req.workspaceId, isDeleted: false });
  const newOnes = session.parsed.filter((p) => p.status === 'ok').length;
  if (existing + newOnes > limits.contacts) {
    throw new ApiError(402, `This import would exceed your plan limit of ${limits.contacts} contacts.`, 'USAGE_LIMIT_REACHED');
  }

  const report = await executeImport(req.workspaceId, req.user._id, {
    parsed: session.parsed, listIds, updateExisting, source: `import:${session.filename}`,
  });
  sessions.delete(sessionId);
  await audit(req, 'contact.import', { meta: { filename: session.filename, ...report } });
  return ok(res, { report }, `Imported ${report.imported} new contacts (${report.updated} updated).`);
});
