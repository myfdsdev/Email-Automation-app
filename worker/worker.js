/**
 * Dedicated background worker process.
 * Run with RUN_WORKERS=true (see .env.example). Keeps heavy job processing
 * out of the web server per the deployment model:
 *   web:    RUN_WORKERS=false  node server/server.js
 *   worker: RUN_WORKERS=true   node worker/worker.js
 */
import { env } from '../server/config/env.js';
import { connectDb, disconnectDb } from '../server/config/db.js';
import { startWorkers, stopWorkers } from '../server/workers/index.js';
import { logger } from '../server/utils/logger.js';

async function main() {
  if (!env.redisUrl) {
    logger.error('REDIS_URL is required for the worker process. Set it in server/.env.');
    process.exit(1);
  }
  await connectDb();
  await startWorkers();
  logger.info('Background worker process running.');
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down workers...`);
  try {
    await stopWorkers();
    await disconnectDb();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.message || err}`));

main().catch((err) => {
  logger.error(`Worker failed to start: ${err.message}`);
  process.exit(1);
});
