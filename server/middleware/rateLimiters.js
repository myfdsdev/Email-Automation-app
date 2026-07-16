import rateLimit from 'express-rate-limit';

const json = (message, code) => ({ success: false, message, code, details: {} });

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Too many requests. Please slow down.', 'RATE_LIMITED'),
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: json('Too many attempts. Try again in 15 minutes.', 'AUTH_RATE_LIMITED'),
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: json('Webhook rate limit exceeded.', 'RATE_LIMITED'),
});
