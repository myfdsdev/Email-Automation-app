import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisConnection, isRedisAvailable } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { BackgroundJobLog } from '../models/BackgroundJobLog.js';

export const QUEUES = {
  EMAIL_SEND: 'email-send',
  CAMPAIGN: 'campaign',
  SEQUENCE: 'sequence',
  GMAIL_SYNC: 'gmail-sync',
  GMAIL_WATCH: 'gmail-watch',
  WEBHOOK: 'webhook-events',
  AUTOMATION: 'automation',
  ANALYTICS: 'analytics',
};

const queues = new Map();

export function queuesEnabled() {
  return !!env.redisUrl;
}

export function getQueue(name) {
  if (!queuesEnabled()) return null;
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: getRedisConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30000 },
          removeOnComplete: { age: 24 * 3600, count: 2000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      })
    );
  }
  return queues.get(name);
}

/* ------------------------------------------------------------------
 * Inline dev fallback: when REDIS_URL is not set (local development),
 * jobs run in-process on a timer so the product flow stays functional.
 * Retries and idempotency still apply (send pipeline is idempotent).
 * ---------------------------------------------------------------- */
const inlineHandlers = new Map();

export function registerInlineHandler(queueName, handler) {
  inlineHandlers.set(queueName, handler);
}

async function runInline(queueName, jobName, data, { delay = 0 } = {}) {
  logger.warn(`[inline-queue] ${queueName}/${jobName} scheduled in-process (Redis not configured)`);
  setTimeout(async () => {
    const handler = inlineHandlers.get(queueName);
    if (!handler) return logger.error(`[inline-queue] no handler for ${queueName}`);
    const log = await BackgroundJobLog.create({ queue: queueName, name: jobName, status: 'active', data, workspaceId: data.workspaceId, startedAt: new Date() }).catch(() => null);
    try {
      const result = await handler({ name: jobName, data });
      if (log) await BackgroundJobLog.updateOne({ _id: log._id }, { status: 'completed', result: typeof result === 'object' ? result : { result }, finishedAt: new Date() });
    } catch (err) {
      logger.error(`[inline-queue] ${queueName}/${jobName} failed: ${err.message}`);
      if (log) await BackgroundJobLog.updateOne({ _id: log._id }, { status: 'failed', error: err.message, finishedAt: new Date() });
    }
  }, delay).unref?.();
  return { inline: true };
}

/** Adds a job, throwing QUEUE_UNAVAILABLE when Redis is configured but down. */
export async function addJob(queueName, jobName, data, opts = {}) {
  if (!queuesEnabled()) return runInline(queueName, jobName, data, opts);
  const queue = getQueue(queueName);
  if (!isRedisAvailable()) {
    // Give the connection a moment on cold start, then verify.
    try {
      await queue.waitUntilReady();
    } catch {
      throw ApiError.serviceUnavailable('Background queue is unavailable. Please try again shortly.', 'QUEUE_UNAVAILABLE');
    }
  }
  try {
    return await queue.add(jobName, data, opts);
  } catch (err) {
    logger.error(`Queue add failed ${queueName}/${jobName}: ${err.message}`);
    throw ApiError.serviceUnavailable('Background queue is unavailable. Please try again shortly.', 'QUEUE_UNAVAILABLE');
  }
}

/** Fan-out campaign sends with per-email delay + jobId-based dedupe. */
export async function enqueueCampaignSends(campaign, contacts) {
  const delaySec = campaign.schedule?.delayBetweenEmailsSec ?? 45;
  const baseDelay = campaign.schedule?.sendNow === false && campaign.schedule?.scheduledAt
    ? Math.max(0, new Date(campaign.schedule.scheduledAt).getTime() - Date.now())
    : 0;
  let enqueued = 0;
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    await addJob(
      QUEUES.EMAIL_SEND,
      'campaign-email',
      { workspaceId: String(campaign.workspaceId), campaignId: String(campaign._id), contactId: String(contact._id) },
      {
        delay: baseDelay + i * delaySec * 1000,
        jobId: `camp:${campaign._id}:${contact._id}`,
        attempts: 3,
      }
    );
    enqueued += 1;
  }
  return enqueued;
}

export async function enqueueSequenceTick() {
  return addJob(QUEUES.SEQUENCE, 'process-due', {}, { jobId: `seq-tick-${Date.now()}` });
}

export async function enqueueGmailSync(connectionId, { initial = false } = {}) {
  return addJob(
    QUEUES.GMAIL_SYNC,
    initial ? 'initial-sync' : 'incremental-sync',
    { connectionId: String(connectionId) },
    { jobId: `gsync:${connectionId}:${initial ? 'init' : Math.floor(Date.now() / 30000)}` }
  );
}

export async function enqueueWebhookEvent(webhookEventId) {
  return addJob(QUEUES.WEBHOOK, 'process', { webhookEventId: String(webhookEventId) }, { attempts: 5 });
}

export async function getQueueStats() {
  if (!queuesEnabled()) return { enabled: false, queues: [] };
  const out = [];
  for (const name of Object.values(QUEUES)) {
    try {
      const q = getQueue(name);
      const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
      out.push({ name, ...counts });
    } catch {
      out.push({ name, error: 'unavailable' });
    }
  }
  return { enabled: true, available: isRedisAvailable(), queues: out };
}
