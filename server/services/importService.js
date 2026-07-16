import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Contact } from '../models/Contact.js';
import { ContactList } from '../models/ContactList.js';
import { filterSuppressed } from './suppressionService.js';
import { normalizeEmail, isValidEmail } from '../utils/personalization.js';
import { runAutomations } from './automationService.js';
import { logger } from '../utils/logger.js';

export const CONTACT_FIELDS = [
  { key: 'firstName', label: 'First name', aliases: ['first name', 'firstname', 'first', 'given name'] },
  { key: 'lastName', label: 'Last name', aliases: ['last name', 'lastname', 'last', 'surname', 'family name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail', 'mail'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'tel'] },
  { key: 'company', label: 'Company', aliases: ['company', 'organization', 'organisation', 'company name'] },
  { key: 'jobTitle', label: 'Job title', aliases: ['job title', 'title', 'position', 'role'] },
  { key: 'website', label: 'Website', aliases: ['website', 'url', 'site', 'domain'] },
  { key: 'industry', label: 'Industry', aliases: ['industry', 'sector'] },
  { key: 'city', label: 'City', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', aliases: ['state', 'province', 'region'] },
  { key: 'country', label: 'Country', aliases: ['country'] },
  { key: 'source', label: 'Source', aliases: ['source', 'lead source'] },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'labels'] },
];

export function parseImportFile(buffer, filename) {
  if (/\.(xlsx|xls)$/i.test(filename)) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (!rows.length) return { headers: [], rows: [] };
    const [headers, ...data] = rows;
    return { headers: headers.map(String), rows: data.filter((r) => r.some((c) => String(c).trim() !== '')) };
  }
  const records = parse(buffer.toString('utf8'), { relax_column_count: true, skip_empty_lines: true, bom: true });
  if (!records.length) return { headers: [], rows: [] };
  const [headers, ...data] = records;
  return { headers: headers.map(String), rows: data };
}

/** Suggests a field mapping from headers using alias matching. */
export function suggestMapping(headers) {
  return headers.map((header) => {
    const h = String(header).trim().toLowerCase();
    const match = CONTACT_FIELDS.find((f) => f.key.toLowerCase() === h || f.aliases.includes(h));
    return { header, field: match?.key || (h ? `custom:${h.replace(/\s+/g, '_')}` : null) };
  });
}

/**
 * Validates rows against a mapping. Returns per-row results plus summary
 * (invalid/missing emails, duplicates within file, existing contacts, suppressed).
 */
export async function validateImport(workspaceId, { headers, rows, mapping }) {
  const emailIdx = mapping.findIndex((m) => m.field === 'email');
  const summary = { totalRows: rows.length, valid: 0, invalidEmails: 0, missingEmails: 0, duplicatesInFile: 0, existingContacts: 0, suppressed: 0 };
  const seen = new Set();
  const parsed = [];

  for (const row of rows) {
    const record = { customFields: {}, tags: [] };
    mapping.forEach((m, i) => {
      const value = String(row[i] ?? '').trim();
      if (!m.field || !value) return;
      if (m.field.startsWith('custom:')) record.customFields[m.field.slice(7)] = value;
      else if (m.field === 'tags') record.tags = value.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
      else record[m.field] = value;
    });

    if (emailIdx === -1 || !record.email) { summary.missingEmails++; parsed.push({ record, status: 'missing_email' }); continue; }
    record.email = normalizeEmail(record.email);
    if (!isValidEmail(record.email)) { summary.invalidEmails++; parsed.push({ record, status: 'invalid_email' }); continue; }
    if (seen.has(record.email)) { summary.duplicatesInFile++; parsed.push({ record, status: 'duplicate_in_file' }); continue; }
    seen.add(record.email);
    parsed.push({ record, status: 'ok' });
  }

  const okEmails = parsed.filter((p) => p.status === 'ok').map((p) => p.record.email);
  const [existing, suppressedSet] = await Promise.all([
    Contact.find({ workspaceId, email: { $in: okEmails } }).select('email').lean(),
    filterSuppressed(workspaceId, okEmails),
  ]);
  const existingSet = new Set(existing.map((e) => e.email));

  for (const p of parsed) {
    if (p.status !== 'ok') continue;
    if (suppressedSet.has(p.record.email)) { p.status = 'suppressed'; summary.suppressed++; }
    else if (existingSet.has(p.record.email)) { p.status = 'existing'; summary.existingContacts++; }
    else summary.valid++;
  }
  return { summary, parsed };
}

export async function executeImport(workspaceId, userId, { parsed, listIds = [], updateExisting = true, source = 'csv_import' }) {
  const report = { imported: 0, updated: 0, skipped: 0, failed: 0 };
  const importedIds = [];

  for (const p of parsed) {
    if (['missing_email', 'invalid_email', 'duplicate_in_file', 'suppressed'].includes(p.status)) { report.skipped++; continue; }
    try {
      const base = { ...p.record, workspaceId, source: p.record.source || source };
      delete base.customFields;
      const update = {
        $setOnInsert: { workspaceId, email: p.record.email, status: 'new', source: base.source },
        $set: {},
        $addToSet: {},
      };
      const fields = ['firstName', 'lastName', 'phone', 'company', 'jobTitle', 'website', 'industry', 'city', 'state', 'country'];
      for (const f of fields) if (p.record[f]) update.$set[f] = p.record[f];
      for (const [k, v] of Object.entries(p.record.customFields || {})) update.$set[`customFields.${k}`] = v;
      if (p.record.tags?.length) update.$addToSet.tags = { $each: p.record.tags };
      if (listIds.length) update.$addToSet.lists = { $each: listIds };
      if (!Object.keys(update.$set).length) delete update.$set;
      if (!Object.keys(update.$addToSet).length) delete update.$addToSet;

      if (p.status === 'existing' && !updateExisting) { report.skipped++; continue; }
      const res = await Contact.findOneAndUpdate({ workspaceId, email: p.record.email }, update, { upsert: true, new: true, rawResult: true });
      const wasNew = !res.lastErrorObject?.updatedExisting;
      if (wasNew) { report.imported++; importedIds.push(res.value._id); }
      else report.updated++;
    } catch (err) {
      report.failed++;
      logger.warn(`Import row failed (${p.record?.email}): ${err.message}`);
    }
  }

  for (const listId of listIds) {
    const count = await Contact.countDocuments({ workspaceId, lists: listId, isDeleted: false });
    await ContactList.updateOne({ _id: listId }, { $set: { contactCount: count } });
  }

  // Trigger automations for newly imported contacts (bounded)
  for (const id of importedIds.slice(0, 200)) {
    const contact = await Contact.findById(id);
    runAutomations(workspaceId, 'contact_imported', { contact }).catch(() => {});
    runAutomations(workspaceId, 'contact_created', { contact }).catch(() => {});
  }
  return report;
}
