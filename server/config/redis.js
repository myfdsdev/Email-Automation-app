import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let connection = null;
let available = false;

export function getRedisConnection() {
  if (!env.redisUrl) return null;
  if (!connection) {
    connection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 10000),
    });
    connection.on('ready', () => {
      available = true;
      logger.info('Redis connected');
    });
    connection.on('error', (err) => {
      if (available) logger.error(`Redis error: ${err.message}`);
      available = false;
    });
  }
  return connection;
}

export function isRedisAvailable() {
  return available;
}
