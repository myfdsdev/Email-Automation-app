import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { startInlineSchedulers } from './workers/index.js';

async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`API listening on ${env.apiUrl} (env: ${env.nodeEnv})`);
  });

  if (env.runWorkers) {
    // Discouraged in production (use the dedicated worker process), supported for small deployments.
    const { startWorkers } = await import('./workers/index.js');
    await startWorkers();
    logger.warn('RUN_WORKERS=true — workers are running inside the web process.');
  } else if (!env.redisUrl) {
    // Local development without Redis: inline queue + schedulers keep flows working.
    startInlineSchedulers();
  }

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.message || err}`));
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error(`Server failed to start: ${err.message}`);
  process.exit(1);
});
