import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { randomToken } from '../../utils/crypto.js';

/**
 * "Sign in with Google" — authentication only.
 *
 * Deliberately separate from integrations/gmail/oauthClient.js: that flow requests
 * mailbox scopes and stores refresh tokens for an already-signed-in user. This one
 * only proves identity, so it asks for the three minimum scopes and keeps no tokens.
 */
export const GOOGLE_LOGIN_SCOPES = ['openid', 'email', 'profile'];

export function isGoogleLoginConfigured() {
  return !!(env.google.clientId && env.google.clientSecret);
}

function createClient() {
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.loginRedirectUri);
}

/**
 * CSRF protection: the state is a short-lived JWT we signed, so a state we did not
 * mint fails verification. `next` lets us return the user to where they started.
 */
export function createState({ next } = {}) {
  return jwt.sign({ nonce: randomToken(16), next: next || null }, env.jwtAccessSecret, { expiresIn: '10m' });
}

export function verifyState(state) {
  return jwt.verify(String(state), env.jwtAccessSecret);
}

export function getLoginUrl(state) {
  return createClient().generateAuthUrl({
    scope: GOOGLE_LOGIN_SCOPES,
    state,
    // No offline access: we do not need a refresh token just to authenticate.
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: false,
  });
}

/**
 * Exchanges the code and verifies the returned id_token's signature and audience
 * against Google's published keys, rather than trusting the payload as received.
 */
export async function exchangeCodeForProfile(code) {
  const client = createClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error('Google did not return an id_token.');

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.google.clientId });
  const p = ticket.getPayload();
  if (!p?.sub) throw new Error('Google id_token had no subject.');

  return {
    googleId: p.sub,
    email: String(p.email || '').toLowerCase().trim(),
    emailVerified: p.email_verified === true,
    name: p.name || p.given_name || (p.email ? String(p.email).split('@')[0] : 'User'),
    picture: p.picture || undefined,
  };
}
