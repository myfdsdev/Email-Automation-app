import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

function getKey() {
  if (env.encryptionKey && /^[0-9a-f]{64}$/i.test(env.encryptionKey)) {
    return Buffer.from(env.encryptionKey, 'hex');
  }
  // Dev fallback: derive a stable key from cookie secret. Production requires a real key (enforced in env.js).
  return crypto.createHash('sha256').update(`ea-dev-${env.cookieSecret}`).digest();
}

export function encryptSecret(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hmacValid(secret, payload, signature) {
  if (!secret) return true; // webhook secret not configured -> accept but log upstream
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}
