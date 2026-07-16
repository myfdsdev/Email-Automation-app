import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
    plan: { type: String, enum: ['free', 'starter', 'growth', 'scale'], default: 'free' },
    status: { type: String, enum: ['active', 'trialing', 'past_due', 'cancelled', 'incomplete'], default: 'active' },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    history: [
      {
        event: String, // upgraded / downgraded / cancelled / renewed / payment_failed
        fromPlan: String,
        toPlan: String,
        amount: Number,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
