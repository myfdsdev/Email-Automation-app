import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Production pins the allowlist to configured origins. Development accepts any
  // localhost port, since Vite shifts ports (5173 -> 5174 ...) when one is taken.
  const allowlist = [env.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean);
  const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowlist.includes(origin)) return cb(null, true);
        if (!env.isProd && isLocalOrigin(origin)) return cb(null, true);
        return cb(new ApiError(403, `Origin ${origin} is not allowed by CORS.`, 'CORS_NOT_ALLOWED'));
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id'],
      exposedHeaders: ['X-Unread-Count'],
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(env.cookieSecret));
  app.use(mongoSanitize());
  if (!env.isProd) app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.use('/api', apiLimiter, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
