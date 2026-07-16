import { UsageRecord } from '../models/UsageRecord.js';
import { Subscription } from '../models/Subscription.js';
import { PLANS } from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';

export function currentPeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function incrementUsage(workspaceId, metric, by = 1) {
  return UsageRecord.findOneAndUpdate(
    { workspaceId, metric, period: currentPeriod() },
    { $inc: { count: by } },
    { upsert: true, new: true }
  );
}

export async function getUsage(workspaceId, metric, period = currentPeriod()) {
  const rec = await UsageRecord.findOne({ workspaceId, metric, period });
  return rec?.count || 0;
}

export async function getPlanLimits(workspaceId) {
  const sub = await Subscription.findOne({ workspaceId });
  const plan = PLANS[sub?.plan || 'free'] || PLANS.free;
  return { plan: sub?.plan || 'free', limits: plan, subscription: sub };
}

const METRIC_LIMIT_MAP = {
  emails_sent: 'emailsPerMonth',
  ai_generations: 'aiCreditsPerMonth',
  ai_analyses: 'aiCreditsPerMonth',
};

/** Throws SENDING_LIMIT_REACHED style errors when a metered metric is exhausted. */
export async function assertWithinLimit(workspaceId, metric, adding = 1) {
  const { limits } = await getPlanLimits(workspaceId);
  const limitKey = METRIC_LIMIT_MAP[metric];
  if (!limitKey) return true;
  let used = await getUsage(workspaceId, metric);
  if (limitKey === 'aiCreditsPerMonth') {
    used = (await getUsage(workspaceId, 'ai_generations')) + (await getUsage(workspaceId, 'ai_analyses'));
  }
  if (used + adding > limits[limitKey]) {
    throw new ApiError(402, `Your plan limit for ${metric.replace('_', ' ')} has been reached. Upgrade to continue.`, 'USAGE_LIMIT_REACHED', { metric, used, limit: limits[limitKey] });
  }
  return true;
}

export async function getUsageSummary(workspaceId) {
  const period = currentPeriod();
  const { plan, limits, subscription } = await getPlanLimits(workspaceId);
  const [emailsSent, aiGen, aiAna] = await Promise.all([
    getUsage(workspaceId, 'emails_sent', period),
    getUsage(workspaceId, 'ai_generations', period),
    getUsage(workspaceId, 'ai_analyses', period),
  ]);
  const { Contact } = await import('../models/Contact.js');
  const { EmailConnection } = await import('../models/EmailConnection.js');
  const { WorkspaceMember } = await import('../models/WorkspaceMember.js');
  const { EmailSequence } = await import('../models/EmailSequence.js');
  const [contacts, gmailAccounts, teamMembers, activeSequences] = await Promise.all([
    Contact.countDocuments({ workspaceId, isDeleted: false }),
    EmailConnection.countDocuments({ workspaceId, provider: 'gmail', status: { $ne: 'disconnected' } }),
    WorkspaceMember.countDocuments({ workspaceId, status: 'active' }),
    EmailSequence.countDocuments({ workspaceId, status: 'active' }),
  ]);
  return {
    period,
    plan,
    subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, billingCycle: subscription.billingCycle } : null,
    usage: {
      contacts: { used: contacts, limit: limits.contacts },
      emails_sent: { used: emailsSent, limit: limits.emailsPerMonth },
      ai_credits: { used: aiGen + aiAna, limit: limits.aiCreditsPerMonth },
      gmail_accounts: { used: gmailAccounts, limit: limits.gmailAccounts },
      team_members: { used: teamMembers, limit: limits.teamMembers },
      active_sequences: { used: activeSequences, limit: limits.activeSequences },
    },
  };
}
