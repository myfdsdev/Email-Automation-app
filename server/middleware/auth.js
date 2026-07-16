import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { User } from '../models/User.js';

export const requireAuth = catchAsync(async (req, _res, next) => {
  const token = req.cookies?.access_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) throw ApiError.unauthorized('Please sign in to continue.', 'NO_TOKEN');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtAccessSecret);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid session.', 'TOKEN_INVALID');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or deactivated.', 'USER_INACTIVE');

  req.user = user;
  next();
});

export const requirePlatformAdmin = catchAsync(async (req, _res, next) => {
  if (!req.user?.isPlatformAdmin) throw ApiError.forbidden('Platform admin access required.', 'ADMIN_ONLY');
  next();
});
