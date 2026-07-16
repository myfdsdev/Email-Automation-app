import jwt from 'jsonwebtoken';
import { EmailConnection } from '../models/EmailConnection.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok } from '../utils/response.js';
import { env } from '../config/env.js';
import { encryptSecret } from '../utils/crypto.js';
import { getAuthUrl, exchangeCode, isGoogleConfigured, createOAuthClient } from '../integrations/gmail/oauthClient.js';
import { watchMailbox, stopWatch } from '../integrations/gmail/gmailService.js';
import { validateApiKey, fetchSenders, fetchLists } from '../integrations/brevo/brevoService.js';
import { enqueueGmailSync } from '../queues/index.js';
import { getPlanLimits } from '../services/usageService.js';
import { audit } from '../services/auditService.js';
import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

export const listConnections = catchAsync(async (req, res) => {
  const connections = await EmailConnection.find({ workspaceId: req.workspaceId });
  return ok(res, {
    connections: connections.map((c) => c.toSafeJSON()),
    googleConfigured: isGoogleConfigured(),
  });
});

/* ---------------- Gmail OAuth ---------------- */

export const gmailAuthUrl = catchAsync(async (req, res) => {
  if (!isGoogleConfigured()) {
    throw ApiError.serviceUnavailable('Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.', 'GOOGLE_NOT_CONFIGURED');
  }
  const { limits } = await getPlanLimits(req.workspaceId);
  const count = await EmailConnection.countDocuments({ workspaceId: req.workspaceId, provider: 'gmail', status: { $ne: 'disconnected' } });
  if (count >= limits.gmailAccounts) throw new ApiError(402, 'Gmail account limit reached for your plan.', 'USAGE_LIMIT_REACHED');

  // CSRF-safe OAuth state: signed JWT binding user + workspace, 10 min expiry
  const state = jwt.sign(
    { sub: String(req.user._id), wid: String(req.workspaceId), purpose: 'gmail_oauth' },
    env.jwtAccessSecret,
    { expiresIn: '10m' }
  );
  return ok(res, { url: getAuthUrl(state) });
});

export const gmailCallback = catchAsync(async (req, res) => {
  const { code, state, error } = req.query;
  const redirect = (status, reason = '') =>
    res.redirect(`${env.clientUrl}/integrations?gmail=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`);

  if (error) return redirect('error', String(error));
  if (!code || !state) return redirect('error', 'missing_code');

  let payload;
  try {
    payload = jwt.verify(String(state), env.jwtAccessSecret);
    if (payload.purpose !== 'gmail_oauth') throw new Error('bad purpose');
  } catch {
    return redirect('error', 'invalid_state');
  }

  const member = await WorkspaceMember.findOne({ workspaceId: payload.wid, userId: payload.sub, status: 'active' });
  if (!member || !['owner', 'admin'].includes(member.role)) return redirect('error', 'forbidden');

  try {
    const tokens = await exchangeCode(String(code));
    const oauth2 = createOAuthClient();
    oauth2.setCredentials(tokens);
    const { data: profile } = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();

    const existing = await EmailConnection.findOne({ workspaceId: payload.wid, provider: 'gmail', email: profile.email.toLowerCase() }).select('+refreshTokenEnc');
    const doc = existing || new EmailConnection({ workspaceId: payload.wid, userId: payload.sub, provider: 'gmail' });
    doc.email = profile.email.toLowerCase();
    doc.googleAccountId = profile.id;
    doc.displayName = profile.name || profile.email;
    doc.accessTokenEnc = encryptSecret(tokens.access_token);
    if (tokens.refresh_token) doc.refreshTokenEnc = encryptSecret(tokens.refresh_token);
    if (!doc.refreshTokenEnc) return redirect('error', 'no_refresh_token');
    doc.tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3500 * 1000);
    doc.grantedScopes = String(tokens.scope || '').split(' ').filter(Boolean);
    doc.status = 'connected';
    doc.lastError = undefined;
    await doc.save();

    // Register push notifications (if Pub/Sub configured) and start initial sync
    try {
      const watch = await watchMailbox(doc._id);
      if (watch) {
        doc.gmailWatchExpiration = new Date(Number(watch.expiration));
        if (watch.historyId) doc.gmailHistoryId = String(watch.historyId);
        await doc.save();
      }
    } catch (err) {
      logger.warn(`Gmail watch setup failed: ${err.message}`);
    }
    await enqueueGmailSync(doc._id, { initial: !doc.initialSyncDone });

    return redirect('connected');
  } catch (err) {
    logger.error(`Gmail OAuth callback failed: ${err.message}`);
    return redirect('error', 'exchange_failed');
  }
});

export const disconnectGmail = catchAsync(async (req, res) => {
  const connection = await EmailConnection.findOne({ _id: req.params.id, workspaceId: req.workspaceId, provider: 'gmail' });
  if (!connection) throw ApiError.notFound('Gmail connection not found.');
  await stopWatch(connection._id).catch(() => {});
  connection.status = 'disconnected';
  connection.accessTokenEnc = undefined;
  connection.refreshTokenEnc = undefined;
  await connection.save();
  await audit(req, 'integration.gmail_disconnect', { resourceType: 'connection', resourceId: connection._id });
  return ok(res, {}, `${connection.email} disconnected.`);
});

export const gmailSyncNow = catchAsync(async (req, res) => {
  const connection = await EmailConnection.findOne({ _id: req.params.id, workspaceId: req.workspaceId, provider: 'gmail' });
  if (!connection) throw ApiError.notFound('Gmail connection not found.');
  if (connection.status === 'disconnected') throw ApiError.badRequest('Reconnect this account first.', 'GMAIL_DISCONNECTED');
  await enqueueGmailSync(connection._id, { initial: !connection.initialSyncDone });
  return ok(res, {}, 'Sync queued.');
});

/* ---------------- Brevo ---------------- */

export const connectBrevo = catchAsync(async (req, res) => {
  const { apiKey, defaultSenderName, defaultSenderEmail, replyToEmail, senderId, webhookSecret } = req.body;

  let account;
  try {
    account = await validateApiKey(apiKey);
  } catch {
    throw ApiError.badRequest('Brevo rejected this API key. Check the key and try again.', 'BREVO_KEY_INVALID');
  }

  const existing = await EmailConnection.findOne({ workspaceId: req.workspaceId, provider: 'brevo' }).select('+apiKeyEnc +webhookSecretEnc');
  const doc = existing || new EmailConnection({ workspaceId: req.workspaceId, userId: req.user._id, provider: 'brevo' });
  doc.apiKeyEnc = encryptSecret(apiKey);
  doc.defaultSenderName = defaultSenderName;
  doc.defaultSenderEmail = defaultSenderEmail;
  doc.replyToEmail = replyToEmail || defaultSenderEmail;
  doc.senderId = senderId;
  if (webhookSecret) doc.webhookSecretEnc = encryptSecret(webhookSecret);
  doc.brevoAccountEmail = account.email;
  doc.brevoPlan = account.plan;
  doc.status = 'connected';
  doc.lastError = undefined;
  await doc.save();
  await audit(req, 'integration.brevo_connect', { resourceType: 'connection', resourceId: doc._id });
  return ok(res, { connection: doc.toSafeJSON(), webhookUrl: `${env.apiUrl}/api/webhooks/brevo?workspace=${req.workspaceId}` }, 'Brevo connected.');
});

export const disconnectBrevo = catchAsync(async (req, res) => {
  const connection = await EmailConnection.findOne({ _id: req.params.id, workspaceId: req.workspaceId, provider: 'brevo' });
  if (!connection) throw ApiError.notFound('Brevo connection not found.');
  connection.status = 'disconnected';
  connection.apiKeyEnc = undefined;
  await connection.save();
  await audit(req, 'integration.brevo_disconnect', { resourceType: 'connection', resourceId: connection._id });
  return ok(res, {}, 'Brevo disconnected.');
});

export const brevoSenders = catchAsync(async (req, res) => {
  const senders = await fetchSenders(req.workspaceId);
  return ok(res, { senders });
});

export const brevoLists = catchAsync(async (req, res) => {
  const lists = await fetchLists(req.workspaceId);
  return ok(res, { lists });
});

export const testBrevo = catchAsync(async (req, res) => {
  try {
    const senders = await fetchSenders(req.workspaceId);
    await EmailConnection.updateOne({ workspaceId: req.workspaceId, provider: 'brevo' }, { $set: { status: 'connected', lastError: null } });
    return ok(res, { healthy: true, senders: senders.length }, 'Brevo connection is healthy.');
  } catch (err) {
    await EmailConnection.updateOne({ workspaceId: req.workspaceId, provider: 'brevo' }, { $set: { status: 'unhealthy', lastError: err.message } });
    throw ApiError.badRequest(`Brevo connection failed: ${err.message}`, 'BREVO_UNHEALTHY');
  }
});
