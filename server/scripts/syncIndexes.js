/**
 * Builds every schema's indexes against the connected database.
 *
 * Mongoose only auto-builds indexes when autoIndex is on, and config/db.js disables it
 * in production (auto-building on every boot is a known way to stall a busy cluster).
 * This schema leans on unique indexes for correctness rather than just speed --
 * Contact{workspaceId,email}, EmailMessage.idempotencyKey (the duplicate-send guard) and
 * User.email among them -- so a fresh production database MUST have them built before
 * traffic arrives. Render runs this as the web service's preDeployCommand.
 *
 * Safe to re-run: syncIndexes() is idempotent for indexes that already match.
 *
 * Note: syncIndexes() also DROPS indexes present in the database but absent from the
 * schema. That is what keeps things tidy across deploys, but it means any index you
 * created by hand outside the schema will be removed.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import * as models from '../models/index.js';
import { logger } from '../utils/logger.js';

async function main() {
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  logger.info('Connected. Synchronising indexes...');

  const entries = Object.entries(models).filter(([, m]) => typeof m?.syncIndexes === 'function');
  let failures = 0;

  for (const [name, model] of entries) {
    try {
      const dropped = await model.syncIndexes();
      const count = Object.keys(model.schema.indexes()).length;
      logger.info(`  ${name}: ${count} schema index(es) ensured${dropped?.length ? `, dropped ${dropped.length} stale` : ''}`);
    } catch (err) {
      failures += 1;
      logger.error(`  ${name}: FAILED - ${err.message}`);
    }
  }

  await mongoose.disconnect();

  if (failures) {
    logger.error(`${failures} model(s) failed to sync indexes. Aborting deploy.`);
    process.exit(1);
  }
  logger.info(`Index sync complete across ${entries.length} models.`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`Index sync failed: ${err.message}`);
  process.exit(1);
});
