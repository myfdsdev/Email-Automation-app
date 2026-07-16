/**
 * Renders {{variable}} and {{variable | default: "fallback"}} placeholders.
 * Variables resolve from contact fields, custom fields and sender context.
 */
const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*default:\s*"([^"]*)")?\s*\}\}/g;

export function buildVariableContext(contact = {}, extras = {}) {
  const custom = {};
  const cf = contact.customFields instanceof Map ? Object.fromEntries(contact.customFields) : contact.customFields || {};
  for (const [k, v] of Object.entries(cf)) custom[k] = v;
  return {
    first_name: contact.firstName || '',
    last_name: contact.lastName || '',
    email: contact.email || '',
    phone: contact.phone || '',
    company: contact.company || '',
    job_title: contact.jobTitle || '',
    website: contact.website || '',
    industry: contact.industry || '',
    city: contact.city || '',
    state: contact.state || '',
    country: contact.country || '',
    ...custom,
    ...extras,
  };
}

export function renderTemplate(text, context) {
  if (!text) return { output: '', missing: [] };
  const missing = new Set();
  const output = String(text).replace(VAR_RE, (_, name, fallback) => {
    const value = context[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
    if (fallback !== undefined) return fallback;
    missing.add(name);
    return '';
  });
  return { output, missing: [...missing] };
}

export function extractVariables(text) {
  const vars = new Set();
  let m;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(String(text || '')))) vars.add(m[1]);
  return [...vars];
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
}
