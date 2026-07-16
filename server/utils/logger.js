/* Minimal structured logger with secret redaction. */
const SENSITIVE = /(authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|password|secret|cookie)/i;

export function redact(obj, depth = 0) {
  if (obj == null || depth > 4) return obj;
  if (typeof obj === 'string') return obj.length > 2000 ? `${obj.slice(0, 2000)}…` : obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return obj;
}

function line(level, msg, meta) {
  const ts = new Date().toISOString();
  const extra = meta ? ` ${JSON.stringify(redact(meta))}` : '';
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[${ts}] ${level.toUpperCase()} ${msg}${extra}`);
}

export const logger = {
  info: (msg, meta) => line('info', msg, meta),
  warn: (msg, meta) => line('warn', msg, meta),
  error: (msg, meta) => line('error', msg, meta),
  debug: (msg, meta) => process.env.NODE_ENV !== 'production' && line('debug', msg, meta),
};
