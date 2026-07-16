import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const bool = (v, d = false) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:5000',

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
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/integrations/gmail/callback',
    pubsubTopic: process.env.GOOGLE_PUBSUB_TOPIC || '',
    pubsubSubscription: process.env.GOOGLE_PUBSUB_SUBSCRIPTION || '',
  },

  brevo: {
    webhookSecret: process.env.BREVO_WEBHOOK_SECRET || '',
  },

  encryptionKey: process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || '',

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
  const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET', 'EMAIL_CREDENTIAL_ENCRYPTION_KEY', 'MONGODB_URI'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`Missing required env vars in production: ${missing.join(', ')}`);
    process.exit(1);
  }
}
