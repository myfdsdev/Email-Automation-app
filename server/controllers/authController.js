import crypto from 'crypto';
import { User } from '../models/User.js';
import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Subscription } from '../models/Subscription.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created } from '../utils/response.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { signAccessToken, createRefreshToken, hashRefreshToken, setAuthCookies, clearAuthCookies } from '../services/tokenService.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailerService.js';
import { audit } from '../services/auditService.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import {
  isGoogleLoginConfigured,
  createState,
  verifyState,
  getLoginUrl,
  exchangeCodeForProfile,
} from '../integrations/google/googleLoginClient.js';

function slugify(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function createWorkspaceForUser(user, name) {
  const workspace = await Workspace.create({ name, slug: slugify(name), owner: user._id });
  await WorkspaceMember.create({
    workspaceId: workspace._id, userId: user._id, email: user.email,
    role: 'owner', status: 'active', joinedAt: new Date(),
  });
  await Subscription.create({ workspaceId: workspace._id, plan: 'free', status: 'active' });
  return workspace;
}

async function issueSession(res, user, req) {
  const accessToken = signAccessToken(user);
  const refresh = createRefreshToken();
  user.refreshTokens = (user.refreshTokens || []).filter((t) => t.expiresAt > new Date()).slice(-9);
  user.refreshTokens.push({ tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt, userAgent: req.headers['user-agent']?.slice(0, 200) });
  user.lastLoginAt = new Date();
  await user.save();
  setAuthCookies(res, accessToken, refresh.token);
}

export const signup = catchAsync(async (req, res) => {
  const { name, email, password, workspaceName } = req.body;
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists.', 'EMAIL_TAKEN');

  const verificationToken = randomToken(24);
  const user = new User({
    name, email, password,
    emailVerificationToken: sha256(verificationToken),
    emailVerificationExpires: new Date(Date.now() + 24 * 3600 * 1000),
  });

  const workspace = await createWorkspaceForUser(user, workspaceName || `${name.split(' ')[0]}'s Workspace`);
  user.defaultWorkspace = workspace._id;
  await user.save();

  // Attach pending invites for this email
  await WorkspaceMember.updateMany(
    { email, status: 'invited' },
    { $set: { userId: user._id } }
  );

  sendVerificationEmail(user, verificationToken).catch((e) => logger.warn(`verification email failed: ${e.message}`));
  await issueSession(res, user, req);
  await audit({ ...req, workspaceId: workspace._id, user }, 'auth.signup');
  return created(res, { user: user.toSafeJSON(), workspace: { id: workspace._id, name: workspace.name } }, 'Account created. Check your inbox to verify your email.');
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');

  // A Google-only account has no password hash. Say so instead of returning a generic
  // "incorrect password" the user could never satisfy.
  if (user && !user.password && user.googleId) {
    throw ApiError.badRequest('This account uses Google sign-in. Use the "Continue with Google" button.', 'USE_GOOGLE_SIGNIN');
  }

  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated.', 'ACCOUNT_DISABLED');
  await issueSession(res, user, req);
  await audit({ ...req, user }, 'auth.login');
  return ok(res, { user: user.toSafeJSON() }, 'Welcome back.');
});

/* ------------------------------ Google sign-in ----------------------------- */

/** Sends the browser to Google's consent screen. This is a top-level navigation, not XHR. */
export const googleAuthStart = catchAsync(async (req, res) => {
  if (!isGoogleLoginConfigured()) {
    return res.redirect(`${env.clientUrl}/login?error=google_not_configured`);
  }
  const state = createState({ next: typeof req.query.next === 'string' ? req.query.next : null });
  return res.redirect(getLoginUrl(state));
});

/**
 * Google redirects the browser back here. We are on the API's own origin at this
 * moment, so the session cookie is set first-party and works afterwards even when
 * the SPA lives on another domain (given COOKIE_SAMESITE=none).
 */
export const googleCallback = catchAsync(async (req, res) => {
  const fail = (reason) => res.redirect(`${env.clientUrl}/login?error=${encodeURIComponent(reason)}`);

  if (req.query.error) return fail(String(req.query.error));
  if (!req.query.code || !req.query.state) return fail('missing_code');

  let next = null;
  try {
    next = verifyState(req.query.state)?.next || null;
  } catch {
    return fail('invalid_state');
  }

  let profile;
  try {
    profile = await exchangeCodeForProfile(String(req.query.code));
  } catch (err) {
    logger.warn(`Google sign-in exchange failed: ${err.message}`);
    return fail('google_exchange_failed');
  }

  if (!profile.email) return fail('no_email');
  // Linking by email is only safe because Google asserts ownership. Without this an
  // unverified Google account could be used to take over a local account by email.
  if (!profile.emailVerified) return fail('email_not_verified');

  let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email }] });
  let workspace = null;

  if (!user) {
    user = new User({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      isEmailVerified: true,
      avatarUrl: profile.picture,
    });
    workspace = await createWorkspaceForUser(user, `${String(profile.name).split(' ')[0]}'s Workspace`);
    user.defaultWorkspace = workspace._id;
    await user.save();
    await WorkspaceMember.updateMany({ email: profile.email, status: 'invited' }, { $set: { userId: user._id } });
    await audit({ ...req, workspaceId: workspace._id, user }, 'auth.signup_google');
  } else {
    // Existing local account signing in with Google for the first time: link them.
    if (!user.googleId) user.googleId = profile.googleId;
    if (!user.isEmailVerified) user.isEmailVerified = true;
    if (!user.avatarUrl && profile.picture) user.avatarUrl = profile.picture;
    await audit({ ...req, user }, 'auth.login_google');
  }

  if (!user.isActive) return fail('account_disabled');

  await issueSession(res, user, req);
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return res.redirect(`${env.clientUrl}${dest}`);
});

export const refresh = catchAsync(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) throw ApiError.unauthorized('Session expired. Please sign in again.', 'NO_REFRESH_TOKEN');
  const tokenHash = hashRefreshToken(token);
  const user = await User.findOne({ 'refreshTokens.tokenHash': tokenHash });
  if (!user) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_INVALID');
  }
  const stored = user.refreshTokens.find((t) => t.tokenHash === tokenHash);
  if (!stored || stored.expiresAt < new Date()) {
    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
    await user.save();
    clearAuthCookies(res);
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'REFRESH_EXPIRED');
  }
  // Rotate refresh token
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== tokenHash);
  const accessToken = signAccessToken(user);
  const next = createRefreshToken();
  user.refreshTokens.push({ tokenHash: next.tokenHash, expiresAt: next.expiresAt, userAgent: req.headers['user-agent']?.slice(0, 200) });
  await user.save();
  setAuthCookies(res, accessToken, next.token);
  return ok(res, { user: user.toSafeJSON() });
});

export const logout = catchAsync(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) {
    await User.updateOne(
      { 'refreshTokens.tokenHash': hashRefreshToken(token) },
      { $pull: { refreshTokens: { tokenHash: hashRefreshToken(token) } } }
    );
  }
  clearAuthCookies(res);
  return ok(res, {}, 'Signed out.');
});

export const forgotPassword = catchAsync(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    const token = randomToken(24);
    user.passwordResetToken = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 3600 * 1000);
    await user.save();
    sendPasswordResetEmail(user, token).catch((e) => logger.warn(`reset email failed: ${e.message}`));
  }
  // Same response either way to avoid account enumeration
  return ok(res, {}, 'If an account exists for that email, a reset link has been sent.');
});

export const resetPassword = catchAsync(async (req, res) => {
  const { token, password } = req.body;
  const user = await User.findOne({
    passwordResetToken: sha256(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+password');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired.', 'RESET_TOKEN_INVALID');
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokens = []; // revoke all sessions
  await user.save();
  clearAuthCookies(res);
  return ok(res, {}, 'Password updated. Please sign in with your new password.');
});

export const verifyEmail = catchAsync(async (req, res) => {
  const user = await User.findOne({
    emailVerificationToken: sha256(req.body.token),
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) throw ApiError.badRequest('This verification link is invalid or has expired.', 'VERIFY_TOKEN_INVALID');
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  return ok(res, {}, 'Email verified. You are all set.');
});

export const resendVerification = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select('+emailVerificationToken +emailVerificationExpires');
  if (user.isEmailVerified) return ok(res, {}, 'Email already verified.');
  const token = randomToken(24);
  user.emailVerificationToken = sha256(token);
  user.emailVerificationExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await user.save();
  await sendVerificationEmail(user, token);
  return ok(res, {}, 'Verification email sent.');
});

export const me = catchAsync(async (req, res) => {
  const memberships = await WorkspaceMember.find({ userId: req.user._id, status: 'active' }).populate('workspaceId', 'name slug plan timezone bookingLink settings businessName businessAddress');
  return ok(res, {
    user: req.user.toSafeJSON(),
    workspaces: memberships
      .filter((m) => m.workspaceId)
      .map((m) => ({
        id: m.workspaceId._id, name: m.workspaceId.name, slug: m.workspaceId.slug,
        plan: m.workspaceId.plan, role: m.role, timezone: m.workspaceId.timezone,
        bookingLink: m.workspaceId.bookingLink, settings: m.workspaceId.settings,
        businessName: m.workspaceId.businessName, businessAddress: m.workspaceId.businessAddress,
      })),
  });
});

export const updateProfile = catchAsync(async (req, res) => {
  const { name, avatarUrl, currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (name) user.name = name;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  if (newPassword) {
    if (!currentPassword || !(await user.comparePassword(currentPassword))) {
      throw ApiError.badRequest('Current password is incorrect.', 'WRONG_PASSWORD');
    }
    user.password = newPassword;
    user.refreshTokens = user.refreshTokens.slice(-1);
  }
  await user.save();
  return ok(res, { user: user.toSafeJSON() }, 'Profile updated.');
});
