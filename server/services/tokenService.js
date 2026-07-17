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

/**
 * 'lax' is the production default rather than 'strict' for two reasons:
 *  - the Gmail OAuth callback returns via a cross-site top-level redirect, and 'strict'
 *    withholds the cookie on that navigation, landing the user back on the login screen;
 *  - it keeps same-origin deploys (server serving the SPA) working out of the box.
 * Cross-site deploys (SPA and API on different domains) must set COOKIE_SAMESITE=none,
 * which browsers only accept on Secure cookies.
 */
const sameSite = env.cookieSameSite || (env.isProd ? 'lax' : 'lax');
const secure = env.isProd || sameSite === 'none';

if (sameSite === 'none' && !secure) {
  throw new Error('COOKIE_SAMESITE=none requires HTTPS (Secure cookies).');
}

const base = {
  httpOnly: true,
  secure,
  sameSite,
  path: '/',
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
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
