import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found.`, 'ROUTE_NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err;

  if (err.name === 'CastError') error = ApiError.badRequest('Invalid identifier format.', 'INVALID_ID');
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({ path: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed.', 'VALIDATION_ERROR', details);
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ');
    error = ApiError.conflict(`A record with this ${field || 'value'} already exists.`, 'DUPLICATE');
  }
  if (err.type === 'entity.too.large') error = ApiError.badRequest('Payload too large.', 'PAYLOAD_TOO_LARGE');

  const status = error.statusCode || 500;
  if (status >= 500) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`, { stack: env.isProd ? undefined : err.stack });
  }

  res.status(status).json({
    success: false,
    message: error.isOperational ? error.message : 'Something went wrong. Please try again.',
    code: error.code || 'INTERNAL_ERROR',
    details: error.details || {},
  });
}
