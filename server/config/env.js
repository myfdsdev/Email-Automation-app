import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const bool = (v, d = false) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');

// Render injects RENDER_EXTERNAL_URL (e.g. https://your-app.onrender.com) automatically.
// Because the API and SPA share one origin there, it is the correct default for both.
const platformUrl = process.env.RENDER_EXTERNAL_URL || '';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || platformUrl || 'http://localhost:5173',
  apiUrl: process.env.API_URL || platformUrl || 'http://localhost:5000',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/email-automation',
  useMemoryDb: bool(process.env.USE_MEMORY_DB),

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  cookieSecret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-me',
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 30,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Must byte-for-byte match an Authorized redirect URI in the Google Cloud console.
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      (platformUrl ? `${platformUrl}/api/integrations/gmail/callback` : 'http://localhost:5000/api/integrations/gmail/callback'),
    pubsubTopic: process.env.GOOGLE_PUBSUB_TOPIC || '',
    pubsubSubscription: process.env.GOOGLE_PUBSUB_SUBSCRIPTION || '',
  },

  brevo: {
    webhookSecret: process.env.BREVO_WEBHOOK_SECRET || '',
  },

  encryptionKey: process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || '',

  // Same-origin deploys (server serves the SPA) work with 'lax', which also lets the
  // Gmail OAuth return redirect carry the session cookie. Cross-site deploys need
  // 'none', which browsers only honour alongside Secure.
  cookieSameSite: (process.env.COOKIE_SAMESITE || '').toLowerCase() || null,
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  // In production the API also serves client/dist unless explicitly disabled.
  serveClient: bool(process.env.SERVE_CLIENT, process.env.NODE_ENV === 'production'),

  redisUrl: process.env.REDIS_URL || '',
  runWorkers: bool(process.env.RUN_WORKERS),

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Email Automation <no-reply@localhost>',
  },
};

if (env.isProd) {
  const errors = [];

  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET', 'EMAIL_CREDENTIAL_ENCRYPTION_KEY', 'MONGODB_URI'];
  for (const key of required) {
    if (!process.env[key]) errors.push(`${key} is required in production.`);
  }

  // Resolved rather than raw: RENDER_EXTERNAL_URL legitimately supplies this on Render.
  if (/localhost|127\.0\.0\.1/.test(env.clientUrl)) {
    errors.push('CLIENT_URL resolved to localhost in production. Set CLIENT_URL to your public https URL.');
  }

  // Must be exactly 32 bytes of hex: crypto.js silently falls back to a key derived
  // from COOKIE_SECRET otherwise, which would encrypt Gmail/Brevo credentials under an
  // unintended key and make them undecryptable the moment COOKIE_SECRET rotates.
  if (process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY && !/^[0-9a-f]{64}$/i.test(process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY)) {
    errors.push(
      'EMAIL_CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  // Without Redis the web process silently falls back to in-process schedulers, which
  // is a dev-only path: jobs would die with the request and never retry.
  if (!env.redisUrl) errors.push('REDIS_URL is required in production (background jobs run through BullMQ).');

  if (env.useMemoryDb) errors.push('USE_MEMORY_DB must not be enabled in production (data would not persist).');

  if (env.cookieSameSite && !['lax', 'strict', 'none'].includes(env.cookieSameSite)) {
    errors.push(`COOKIE_SAMESITE must be one of lax, strict, none (got "${env.cookieSameSite}").`);
  }

  // Catches a local .env pasted into the host's dashboard: Google rejects a redirect
  // URI that does not exactly match the console entry, so a stale localhost value here
  // breaks the Gmail connect flow at the final redirect with an opaque error.
  if (env.google.clientId && /localhost|127\.0\.0\.1/.test(env.google.redirectUri)) {
    errors.push(`GOOGLE_REDIRECT_URI points at localhost (${env.google.redirectUri}). Set it to https://<your-domain>/api/integrations/gmail/callback and register that exact URI in the Google Cloud console.`);
  }

  const weak = ['dev-access-secret-change-me', 'dev-refresh-secret-change-me', 'dev-cookie-secret-change-me'];
  if (weak.includes(env.jwtAccessSecret) || weak.includes(env.jwtRefreshSecret) || weak.includes(env.cookieSecret)) {
    errors.push('Default development secrets must not be used in production.');
  }

  if (errors.length) {
    // eslint-disable-next-line no-console
    console.error(`\nInvalid production configuration:\n${errors.map((e) => `  - ${e}`).join('\n')}\n`);
    process.exit(1);
  }
}
