import { Worker, Queue } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisConnection } from '../config/redis.js';
import { QUEUES, registerInlineHandler, queuesEnabled } from '../queues/index.js';
import {
  emailSendProcessor, sequenceProcessor, gmailSyncProcessor,
  gmailWatchProcessor, webhookProcessor, automationProcessor, analyticsProcessor,
} from './processors.js';
import { BackgroundJobLog } from '../models/BackgroundJobLog.js';
import { logger } from '../utils/logger.js';

const PROCESSORS = {
  [QUEUES.EMAIL_SEND]: { handler: emailSendProcessor, concurrency: 5 },
  [QUEUES.SEQUENCE]: { handler: sequenceProcessor, concurrency: 2 },
  [QUEUES.GMAIL_SYNC]: { handler: gmailSyncProcessor, concurrency: 3 },
  [QUEUES.GMAIL_WATCH]: { handler: gmailWatchProcessor, concurrency: 1 },
  [QUEUES.WEBHOOK]: { handler: webhookProcessor, concurrency: 10 },
  [QUEUES.AUTOMATION]: { handler: automationProcessor, concurrency: 5 },
  [QUEUES.ANALYTICS]: { handler: analyticsProcessor, concurrency: 1 },
};

const workers = [];

async function logJob(queue, job, status, extra = {}) {
  try {
    await BackgroundJobLog.findOneAndUpdate(
      { queue, jobId: String(job.id) },
      {
        $set: {
          name: job.name, status,
          workspaceId: job.data?.workspaceId || undefined,
          attempts: job.attemptsMade,
          data: { ...job.data },
          ...extra,
        },
      },
      { upsert: true }
    );
  } catch { /* job logging must never break processing */ }
}

export async function startWorkers() {
  if (!queuesEnabled()) {
    logger.warn('REDIS_URL not set — BullMQ workers disabled. Inline dev queue handles jobs in the web process.');
    return;
  }
  const connection = getRedisConnection();

  for (const [queueName, { handler, concurrency }] of Object.entries(PROCESSORS)) {
    const worker = new Worker(
      queueName,
      async (job) => {
        const startedAt = new Date();
        await logJob(queueName, job, 'active', { startedAt });
        const result = await handler(job);
        await logJob(queueName, job, 'completed', { result, finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime() });
        return result;
      },
      { connection, concurrency, autorun: true }
    );
    worker.on('failed', async (job, err) => {
      logger.error(`[${queueName}] job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
      if (job) await logJob(queueName, job, job.attemptsMade >= (job.opts.attempts || 1) ? 'failed' : 'retrying', { error: err.message?.slice(0, 500), finishedAt: new Date() });
    });
    worker.on('error', (err) => logger.error(`[${queueName}] worker error: ${err.message}`));
    workers.push(worker);
    logger.info(`Worker started: ${queueName} (concurrency ${concurrency})`);
  }

  await scheduleRepeatables(connection);
}

async function scheduleRepeatables(connection) {
  const schedules = [
    { queue: QUEUES.SEQUENCE, name: 'process-due', every: 60 * 1000 },
    { queue: QUEUES.GMAIL_SYNC, name: 'sync-all', every: (env.google.pubsubTopic ? 15 : 5) * 60 * 1000 },
    { queue: QUEUES.GMAIL_WATCH, name: 'renew-all', every: 6 * 60 * 60 * 1000 },
    { queue: QUEUES.ANALYTICS, name: 'refresh-campaign-reports', every: 10 * 60 * 1000 },
  ];
  for (const s of schedules) {
    const q = new Queue(s.queue, { connection });
    await q.upsertJobScheduler(`sched:${s.queue}:${s.name}`, { every: s.every }, { name: s.name, data: {} });
    logger.info(`Scheduled ${s.queue}/${s.name} every ${s.every / 1000}s`);
  }
}

/** Inline handlers for Redis-less dev mode (registered in web process). */
export function registerInlineHandlers() {
  registerInlineHandler(QUEUES.EMAIL_SEND, emailSendProcessor);
  registerInlineHandler(QUEUES.SEQUENCE, sequenceProcessor);
  registerInlineHandler(QUEUES.GMAIL_SYNC, gmailSyncProcessor);
  registerInlineHandler(QUEUES.GMAIL_WATCH, gmailWatchProcessor);
  registerInlineHandler(QUEUES.WEBHOOK, webhookProcessor);
  registerInlineHandler(QUEUES.AUTOMATION, automationProcessor);
  registerInlineHandler(QUEUES.ANALYTICS, analyticsProcessor);
}

/** Dev-mode timers that replace repeatable jobs when Redis is absent. */
export function startInlineSchedulers() {
  if (queuesEnabled()) return;
  registerInlineHandlers();
  const tick = async () => {
    try { await sequenceProcessor({ name: 'process-due', data: {} }); } catch (err) { logger.error(`inline sequence tick: ${err.message}`); }
  };
  const sync = async () => {
    try { await gmailSyncProcessor({ name: 'sync-all', data: {} }); } catch (err) { logger.error(`inline gmail sync: ${err.message}`); }
  };
  setInterval(tick, 60 * 1000).unref();
  setInterval(sync, 5 * 60 * 1000).unref();
  logger.warn('Inline schedulers active (dev mode without Redis).');
}

export async function stopWorkers() {
  await Promise.all(workers.map((w) => w.close()));
}
