import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let memoryServer = null;

export async function connectDb() {
  mongoose.set('strictQuery', true);
  let uri = env.mongoUri;

  if (env.useMemoryDb) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('email-automation');
    logger.warn('Using in-memory MongoDB (USE_MEMORY_DB=true). Data is not persisted.');
  }

  await mongoose.connect(uri, { autoIndex: !env.isProd });
  logger.info(`MongoDB connected (${env.useMemoryDb ? 'memory' : 'uri'})`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
