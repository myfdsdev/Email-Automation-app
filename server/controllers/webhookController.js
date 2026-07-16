import mongoose from 'mongoose';
import { WebhookEvent } from '../models/WebhookEvent.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { catchAsync } from '../utils/catchAsync.js';
import { decryptSecret, hmacValid } from '../utils/crypto.js';
import { enqueueWebhookEvent, enqueueGmailSync } from '../queues/index.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/webhooks/brevo?workspace=<id>
 * Brevo marketing + transactional events. Always 200s quickly; processing is
 * queued and idempotent (unique eventId + event-level dedupe keys).
 */
export const brevoWebhook = catchAsync(async (req, res) => {
  const workspaceId = req.query.workspace;
  if (!workspaceId || !mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({ success: false, message: 'workspace query param required', code: 'WORKSPACE_REQUIRED' });
  }

  // Optional shared-secret validation (configured per workspace on connect)
  const conn = await EmailConnection.findOne({ workspaceId, provider: 'brevo' }).select('+webhookSecretEnc');
  const secret = conn?.webhookSecretEnc ? decryptSecret(conn.webhookSecretEnc) : '';
  if (secret) {
    const provided = req.headers['x-webhook-secret'] || req.query.secret;
    if (!hmacValid(secret, 'static', undefined) && provided !== secret) {
      logger.warn(`Brevo webhook rejected (bad secret) for workspace ${workspaceId}`);
      return res.status(401).json({ success: false, message: 'Invalid webhook secret', code: 'WEBHOOK_INVALID' });
    }
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];
  let accepted = 0;
  for (const payload of events) {
    if (!payload || typeof payload !== 'object') continue;
    const eventId = `brevo:${payload.event}:${payload['message-id'] || payload.messageId || payload.email || ''}:${payload.date || payload.ts_event || payload.ts || ''}:${payload.link || ''}`;
    try {
      const doc = await WebhookEvent.create({
        workspaceId,
        provider: 'brevo',
        eventId,
        eventType: payload.event,
        payload,
        status: 'queued',
      });
      await enqueueWebhookEvent(doc._id);
      accepted += 1;
    } catch (err) {
      if (err.code === 11000) {
        // duplicate delivery — acknowledge silently
        await WebhookEvent.updateOne({ provider: 'brevo', eventId }, { $set: { status: 'duplicate' } }).catch(() => {});
      } else {
        logger.error(`Brevo webhook store failed: ${err.message}`);
      }
    }
  }
  return res.status(200).json({ success: true, accepted });
});

/**
 * POST /api/webhooks/gmail
 * Google Cloud Pub/Sub push endpoint for Gmail watch notifications.
 * Message payload: base64 JSON { emailAddress, historyId }.
 */
export const gmailWebhook = catchAsync(async (req, res) => {
  const message = req.body?.message;
  if (!message?.data) return res.status(204).end();

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
  } catch {
    return res.status(204).end();
  }
  const email = String(decoded.emailAddress || '').toLowerCase();
  if (!email) return res.status(204).end();

  const eventId = `gmail:${message.messageId || `${email}:${decoded.historyId}`}`;
  try {
    const connections = await EmailConnection.find({ provider: 'gmail', email, status: { $in: ['connected', 'unhealthy'] } });
    await WebhookEvent.create({
      provider: 'gmail',
      eventId,
      eventType: 'history',
      payload: { emailAddress: email, historyId: decoded.historyId },
      status: 'processed',
      processedAt: new Date(),
      workspaceId: connections[0]?.workspaceId,
    });
    for (const conn of connections) await enqueueGmailSync(conn._id);
  } catch (err) {
    if (err.code !== 11000) logger.error(`Gmail webhook failed: ${err.message}`);
  }
  // Pub/Sub expects a 2xx ack regardless
  return res.status(204).end();
});
