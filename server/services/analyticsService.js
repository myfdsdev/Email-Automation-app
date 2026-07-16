import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { EmailCampaign } from '../models/EmailCampaign.js';
import { EmailSequence } from '../models/EmailSequence.js';
import { SequenceEnrollment } from '../models/SequenceEnrollment.js';
import { Appointment } from '../models/Appointment.js';
import { EmailConnection } from '../models/EmailConnection.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function rangeFilter(from, to) {
  const f = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(to);
  return Object.keys(f).length ? f : null;
}

export async function dashboardOverview(workspaceId, { from, to }) {
  const wid = oid(workspaceId);
  const range = rangeFilter(from, to);
  const eventMatch = { workspaceId: wid, ...(range ? { occurredAt: range } : {}) };

  const [eventCounts, totals, prevTotals] = await Promise.all([
    EmailEvent.aggregate([{ $match: eventMatch }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    quickTotals(wid, range),
    range ? quickTotals(wid, shiftRange(range)) : Promise.resolve(null),
  ]);
  const events = Object.fromEntries(eventCounts.map((e) => [e._id, e.count]));

  const sent = events.sent || 0;
  const delivered = events.delivered || 0;
  const denominator = Math.max(delivered, sent) || 1;

  return {
    metrics: {
      totalContacts: { value: totals.contacts, previous: prevTotals?.contacts ?? null },
      emailsSent: { value: sent, previous: null },
      delivered: { value: delivered, previous: null },
      openRate: { value: pct(events.opened, denominator), previous: null },
      clickRate: { value: pct(events.clicked, denominator), previous: null },
      replyRate: { value: pct(events.replied, sent || 1), previous: null },
      interestedLeads: { value: totals.interested, previous: prevTotals?.interested ?? null },
      appointmentsBooked: { value: totals.appointments, previous: prevTotals?.appointments ?? null },
    },
    events,
  };
}

function shiftRange(range) {
  const from = range.$gte?.getTime();
  const to = (range.$lte || new Date()).getTime();
  if (!from) return null;
  const span = to - from;
  return { $gte: new Date(from - span), $lte: new Date(from) };
}

function pct(n, d) {
  return d ? Math.round(((n || 0) / d) * 1000) / 10 : 0;
}

async function quickTotals(wid, range) {
  const createdRange = range ? { createdAt: range } : {};
  const [contacts, interested, appointments] = await Promise.all([
    Contact.countDocuments({ workspaceId: wid, isDeleted: false }),
    Contact.countDocuments({ workspaceId: wid, status: { $in: ['interested', 'qualified', 'meeting_booked'] }, ...(range ? { updatedAt: range } : {}) }),
    Appointment.countDocuments({ workspaceId: wid, ...createdRange }),
  ]);
  return { contacts, interested, appointments };
}

/** Daily time-series of core events for the performance chart. */
export async function performanceSeries(workspaceId, { from, to }) {
  const wid = oid(workspaceId);
  const range = rangeFilter(from, to) || { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) };
  const rows = await EmailEvent.aggregate([
    { $match: { workspaceId: wid, occurredAt: range, type: { $in: ['sent', 'delivered', 'opened', 'clicked', 'replied'] } } },
    {
      $group: {
        _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, type: '$type' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.day': 1 } },
  ]);
  const byDay = {};
  for (const r of rows) {
    byDay[r._id.day] = byDay[r._id.day] || { date: r._id.day, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0 };
    byDay[r._id.day][r._id.type] = r.count;
  }
  return Object.values(byDay);
}

export async function providerComparison(workspaceId, { from, to }) {
  const wid = oid(workspaceId);
  const range = rangeFilter(from, to);
  const rows = await EmailEvent.aggregate([
    { $match: { workspaceId: wid, provider: { $in: ['gmail', 'brevo'] }, ...(range ? { occurredAt: range } : {}) } },
    { $group: { _id: { provider: '$provider', type: '$type' }, count: { $sum: 1 } } },
  ]);
  const out = { gmail: {}, brevo: {} };
  rows.forEach((r) => { out[r._id.provider][r._id.type] = r.count; });
  return out;
}

export async function replyClassificationBreakdown(workspaceId, { from, to }) {
  const wid = oid(workspaceId);
  const range = rangeFilter(from, to);
  const rows = await EmailMessage.aggregate([
    { $match: { workspaceId: wid, direction: 'inbound', 'aiAnalysis.classification': { $exists: true }, ...(range ? { createdAt: range } : {}) } },
    { $group: { _id: '$aiAnalysis.classification', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ classification: r._id, count: r.count }));
}

export async function campaignAnalytics(workspaceId, campaignId) {
  const campaign = await EmailCampaign.findOne({ _id: campaignId, workspaceId }).lean();
  if (!campaign) return null;
  const s = campaign.stats;
  const denom = Math.max(s.delivered, s.sent) || 1;
  return {
    campaign,
    rates: {
      deliveryRate: pct(s.delivered, s.sent || 1),
      openRate: pct(s.uniqueOpened || s.opened, denom),
      clickRate: pct(s.uniqueClicked || s.clicked, denom),
      replyRate: pct(s.replied, s.sent || 1),
      interestedRate: pct(s.interested, s.replied || 1),
      bounceRate: pct(s.bounced, s.sent || 1),
      unsubscribeRate: pct(s.unsubscribed, s.sent || 1),
    },
    timeline: await EmailEvent.aggregate([
      { $match: { workspaceId: oid(workspaceId), campaignId: oid(campaignId) } },
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt' } }, type: '$type' }, count: { $sum: 1 } } },
      { $sort: { '_id.day': 1 } },
    ]),
  };
}

export async function sequenceAnalytics(workspaceId, sequenceId) {
  const wid = oid(workspaceId);
  const sequence = await EmailSequence.findOne({ _id: sequenceId, workspaceId }).lean();
  if (!sequence) return null;
  const [byStatus, stepStats] = await Promise.all([
    SequenceEnrollment.aggregate([
      { $match: { workspaceId: wid, sequenceId: oid(sequenceId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    (await import('../models/SequenceStep.js')).SequenceStep.find({ sequenceId }).sort({ order: 1 }).lean(),
  ]);
  return {
    sequence,
    enrollmentByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
    steps: stepStats.map((s) => ({
      order: s.order, name: s.name || s.subject, sent: s.stats.sent, opened: s.stats.opened,
      clicked: s.stats.clicked, replied: s.stats.replied, skipped: s.stats.skipped,
      replyRate: pct(s.stats.replied, s.stats.sent || 1),
    })),
  };
}

export async function teamAnalytics(workspaceId, { from, to }) {
  const wid = oid(workspaceId);
  const range = rangeFilter(from, to);
  const [repliesHandled, interested, appointments] = await Promise.all([
    EmailMessage.aggregate([
      { $match: { workspaceId: wid, direction: 'outbound', sentByUser: { $exists: true, $ne: null }, ...(range ? { createdAt: range } : {}) } },
      { $group: { _id: '$sentByUser', count: { $sum: 1 } } },
    ]),
    Contact.aggregate([
      { $match: { workspaceId: wid, status: { $in: ['interested', 'qualified'] }, assignedTo: { $exists: true, $ne: null } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]),
    Appointment.aggregate([
      { $match: { workspaceId: wid, assignedTo: { $exists: true, $ne: null }, ...(range ? { createdAt: range } : {}) } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]),
  ]);
  return { repliesHandled, interested, appointments };
}

export async function integrationHealth(workspaceId) {
  const connections = await EmailConnection.find({ workspaceId }).lean();
  return connections.map((c) => ({
    id: c._id, provider: c.provider, email: c.email || c.defaultSenderEmail,
    status: c.status, lastSyncAt: c.lastSyncAt, lastError: c.lastError,
    watchExpiresAt: c.gmailWatchExpiration, sentToday: c.sentToday,
  }));
}
