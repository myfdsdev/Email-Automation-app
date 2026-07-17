import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { router } from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  // Production serves the built SPA from this same service, so the browser treats the
  // API as same-origin: no CORS preflights and no cross-site cookie requirements.
  if (env.serveClient) {
    const clientDist = path.resolve(__dirname, '..', 'client', 'dist');

    if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
      logger.error(`SERVE_CLIENT is on but no client build found at ${clientDist}. Run: npm run build --prefix client`);
    } else {
      // Vite fingerprints filenames under /assets, so they can be cached indefinitely.
      app.use(
        '/assets',
        express.static(path.join(clientDist, 'assets'), {
          immutable: true,
          maxAge: '1y',
        })
      );
      app.use(express.static(clientDist, { index: false, maxAge: '1h' }));

      // SPA history fallback. Anything unmatched that is not an API/health call gets
      // index.html, which must never be cached or clients pin to a stale asset manifest.
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path === '/health') return next();
        res.set('Cache-Control', 'no-store, must-revalidate');
        res.sendFile(path.join(clientDist, 'index.html'));
      });
      logger.info(`Serving client build from ${clientDist}`);
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
