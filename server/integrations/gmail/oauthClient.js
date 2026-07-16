import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import { EmailConnection } from '../../models/EmailConnection.js';
import { logger } from '../../utils/logger.js';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function isGoogleConfigured() {
  return !!(env.google.clientId && env.google.clientSecret);
}

export function createOAuthClient() {
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
}

export function getAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Returns an authorized OAuth2 client for a connection, refreshing the access
 * token when expired and persisting the new token (encrypted).
 */
export async function getAuthorizedClient(connectionId) {
  const conn = await EmailConnection.findById(connectionId).select('+accessTokenEnc +refreshTokenEnc');
  if (!conn || conn.provider !== 'gmail') throw new Error('Gmail connection not found');
  if (conn.status === 'disconnected') throw new Error('Gmail connection is disconnected');

  const client = createOAuthClient();
  client.setCredentials({
    access_token: decryptSecret(conn.accessTokenEnc),
    refresh_token: decryptSecret(conn.refreshTokenEnc),
    expiry_date: conn.tokenExpiresAt?.getTime(),
  });

  const needsRefresh = !conn.tokenExpiresAt || conn.tokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000;
  if (needsRefresh) {
    try {
      const { credentials } = await client.refreshAccessToken();
      conn.accessTokenEnc = encryptSecret(credentials.access_token);
      if (credentials.refresh_token) conn.refreshTokenEnc = encryptSecret(credentials.refresh_token);
      conn.tokenExpiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3500 * 1000);
      if (conn.status === 'expired' || conn.status === 'unhealthy') conn.status = 'connected';
      conn.lastError = undefined;
      await conn.save();
      client.setCredentials(credentials);
    } catch (err) {
      logger.error(`Gmail token refresh failed for ${conn.email}: ${err.message}`);
      conn.status = 'expired';
      conn.lastError = 'Token refresh failed. Please reconnect this Gmail account.';
      await conn.save();
      const e = new Error('GMAIL_TOKEN_EXPIRED');
      e.code = 'GMAIL_TOKEN_EXPIRED';
      throw e;
    }
  }
  return { client, connection: conn };
}

export function gmailApi(client) {
  return google.gmail({ version: 'v1', auth: client });
}
