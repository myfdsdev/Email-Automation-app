import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email }, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl });
}

export function createRefreshToken() {
  const token = randomToken(48);
  return {
    token,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
  };
}

export function hashRefreshToken(token) {
  return sha256(token);
}

const base = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'strict' : 'lax',
  path: '/',
};

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie('access_token', accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, {
    ...base,
    path: '/api/auth',
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', { ...base });
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
}
