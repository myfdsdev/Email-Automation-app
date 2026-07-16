import { Subscription } from '../models/Subscription.js';
import { Workspace } from '../models/Workspace.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok } from '../utils/response.js';
import { getUsageSummary } from '../services/usageService.js';
import { PLANS } from '../utils/constants.js';
import { env } from '../config/env.js';
import { audit } from '../services/auditService.js';

export const getBilling = catchAsync(async (req, res) => {
  const [summary, subscription] = await Promise.all([
    getUsageSummary(req.workspaceId),
    Subscription.findOne({ workspaceId: req.workspaceId }),
  ]);
  return ok(res, {
    ...summary,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })),
    history: subscription?.history?.slice(-20).reverse() || [],
    stripeConfigured: !!env.stripe.secretKey,
  });
});

/**
 * Plan change. With STRIPE_SECRET_KEY set this would create a Checkout session;
 * without Stripe (self-hosted mode) the plan is applied directly and recorded.
 */
export const changePlan = catchAsync(async (req, res) => {
  const { plan, billingCycle } = req.body;
  const sub = (await Subscription.findOne({ workspaceId: req.workspaceId })) ||
    (await Subscription.create({ workspaceId: req.workspaceId, plan: 'free', status: 'active' }));

  if (sub.plan === plan) throw ApiError.badRequest(`You are already on the ${PLANS[plan].name} plan.`, 'SAME_PLAN');
  const upgrade = PLANS[plan].price > PLANS[sub.plan].price;

  if (env.stripe.secretKey && plan !== 'free') {
    // Stripe checkout stub: intentionally not creating live sessions in this build.
    return ok(res, {
      requiresPayment: true,
      message: 'Stripe is configured. Wire STRIPE price IDs and a Checkout session here for live payments.',
    });
  }

  const fromPlan = sub.plan;
  sub.plan = plan;
  if (billingCycle) sub.billingCycle = billingCycle;
  sub.status = 'active';
  sub.currentPeriodStart = new Date();
  sub.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  sub.cancelAtPeriodEnd = false;
  sub.history.push({ event: upgrade ? 'upgraded' : 'downgraded', fromPlan, toPlan: plan, amount: PLANS[plan].price });
  await sub.save();
  await Workspace.updateOne({ _id: req.workspaceId }, { $set: { plan } });
  await audit(req, 'billing.change_plan', { meta: { fromPlan, toPlan: plan } });
  return ok(res, { subscription: sub }, `Plan changed to ${PLANS[plan].name}.`);
});

export const cancelSubscription = catchAsync(async (req, res) => {
  const sub = await Subscription.findOne({ workspaceId: req.workspaceId });
  if (!sub || sub.plan === 'free') throw ApiError.badRequest('There is no paid subscription to cancel.', 'NO_SUBSCRIPTION');
  sub.cancelAtPeriodEnd = true;
  sub.history.push({ event: 'cancelled', fromPlan: sub.plan, toPlan: 'free' });
  await sub.save();
  await audit(req, 'billing.cancel');
  return ok(res, { subscription: sub }, 'Subscription will end at the current period. You will move to the Free plan.');
});
