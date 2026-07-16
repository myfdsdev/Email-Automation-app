import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** System mailer for verification / reset / invite emails (not campaign traffic). */
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (env.smtp.host) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  } else {
    transporter = {
      sendMail: async (opts) => {
        logger.info(`[DEV MAIL] To: ${opts.to} | Subject: ${opts.subject}`);
        logger.info(`[DEV MAIL] ${String(opts.text || '').slice(0, 400)}`);
        return { messageId: `dev-${Date.now()}` };
      },
    };
  }
  return transporter;
}

export async function sendSystemEmail({ to, subject, text, html }) {
  const t = getTransporter();
  return t.sendMail({ from: env.smtp.from, to, subject, text, html });
}

export async function sendVerificationEmail(user, token) {
  const url = `${env.clientUrl}/verify-email?token=${token}`;
  return sendSystemEmail({
    to: user.email,
    subject: 'Verify your email address',
    text: `Hi ${user.name},\n\nConfirm your email address to activate your Email Automation account:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${user.name},</p><p>Confirm your email address to activate your Email Automation account:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(user, token) {
  const url = `${env.clientUrl}/reset-password?token=${token}`;
  return sendSystemEmail({
    to: user.email,
    subject: 'Reset your password',
    text: `Hi ${user.name},\n\nReset your password:\n${url}\n\nIf you didn't request this, you can ignore this email. The link expires in 1 hour.`,
    html: `<p>Hi ${user.name},</p><p><a href="${url}">Reset your password</a></p><p>If you didn't request this, ignore this email. The link expires in 1 hour.</p>`,
  });
}

export async function sendInviteEmail({ email, workspaceName, inviterName, token }) {
  const url = `${env.clientUrl}/accept-invite?token=${token}`;
  return sendSystemEmail({
    to: email,
    subject: `${inviterName} invited you to ${workspaceName}`,
    text: `${inviterName} invited you to join the "${workspaceName}" workspace on Email Automation.\n\nAccept: ${url}`,
    html: `<p>${inviterName} invited you to join the <b>${workspaceName}</b> workspace on Email Automation.</p><p><a href="${url}">Accept invitation</a></p>`,
  });
}
