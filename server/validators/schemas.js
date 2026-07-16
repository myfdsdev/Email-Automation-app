import { z } from 'zod';
import {
  CONTACT_STATUSES, TEMPLATE_CATEGORIES, AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS, ROLES,
} from '../utils/constants.js';

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');
const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const shortText = z.string().trim().max(200);

/* ---------- auth ---------- */
export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  workspaceName: z.string().trim().min(2).max(120).optional(),
});
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(128) });
export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

/* ---------- workspace / team ---------- */
export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().max(64).optional(),
});
export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  timezone: z.string().max(64).optional(),
  businessName: shortText.optional(),
  businessAddress: z.string().max(400).optional(),
  bookingLink: z.string().url().optional().or(z.literal('')),
  settings: z.object({
    dailySendLimit: z.number().int().min(1).max(2000).optional(),
    hourlySendLimit: z.number().int().min(1).max(500).optional(),
    sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    skipWeekends: z.boolean().optional(),
    autoReplyEnabled: z.boolean().optional(),
    autoReplySafeCategories: z.array(z.string()).optional(),
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
  }).optional(),
});
export const inviteMemberSchema = z.object({ email, role: z.enum(ROLES.filter((r) => r !== 'owner')) });
export const updateMemberSchema = z.object({ role: z.enum(ROLES.filter((r) => r !== 'owner')).optional(), status: z.enum(['active', 'suspended']).optional() });

/* ---------- contacts ---------- */
export const contactBody = z.object({
  firstName: shortText.optional(),
  lastName: shortText.optional(),
  email,
  phone: shortText.optional(),
  company: shortText.optional(),
  jobTitle: shortText.optional(),
  website: z.string().trim().max(300).optional(),
  industry: shortText.optional(),
  city: shortText.optional(),
  state: shortText.optional(),
  country: shortText.optional(),
  source: shortText.optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
  leadScore: z.number().int().min(0).max(100).optional(),
  assignedTo: objectId.optional().nullable(),
  tags: z.array(z.string().trim().max(50)).max(50).optional(),
  lists: z.array(objectId).optional(),
  customFields: z.record(z.string(), z.string().max(500)).optional(),
  consentStatus: z.enum(['unknown', 'opted_in', 'opted_out']).optional(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});
export const updateContactSchema = contactBody.partial().extend({ email: email.optional() });
export const bulkContactsSchema = z.object({
  ids: z.array(objectId).min(1).max(2000),
  action: z.enum(['delete', 'add_tag', 'remove_tag', 'add_to_list', 'remove_from_list', 'set_status', 'assign', 'unsubscribe', 'suppress']),
  value: z.any().optional(),
});
export const addNoteSchema = z.object({ body: z.string().trim().min(1).max(4000) });

/* ---------- lists & segments ---------- */
export const listSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional() });
export const listContactsSchema = z.object({ contactIds: z.array(objectId).min(1).max(5000) });
export const segmentFilterSchema = z.object({
  field: z.string().trim().min(1).max(60),
  operator: z.enum(['equals', 'not_equals', 'contains', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'before', 'after']),
  value: z.any().optional(),
});
export const segmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  filters: z.array(segmentFilterSchema).min(1).max(20),
});

/* ---------- templates ---------- */
export const templateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  subject: z.string().max(300).optional(),
  bodyHtml: z.string().max(200000).optional(),
  bodyText: z.string().max(100000).optional(),
  editorMode: z.enum(['rich', 'plain', 'html']).optional(),
});
export const testEmailSchema = z.object({
  to: email,
  connectionId: objectId,
  subject: z.string().max(300).optional(),
  bodyHtml: z.string().max(200000).optional(),
  bodyText: z.string().max(100000).optional(),
});

/* ---------- campaigns ---------- */
export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  type: z.enum(['outreach', 'marketing', 'newsletter', 'transactional']).optional(),
  provider: z.enum(['gmail', 'brevo']),
  connectionId: objectId.optional(),
  audience: z.object({
    listIds: z.array(objectId).optional(),
    segmentIds: z.array(objectId).optional(),
    excludeContactIds: z.array(objectId).optional(),
    excludeUnsubscribed: z.boolean().optional(),
    excludeBounced: z.boolean().optional(),
    excludeSuppressed: z.boolean().optional(),
    excludePreviouslyContacted: z.boolean().optional(),
  }).optional(),
  content: z.object({
    templateId: objectId.optional().nullable(),
    subject: z.string().max(300).optional(),
    bodyHtml: z.string().max(300000).optional(),
    bodyText: z.string().max(150000).optional(),
  }).optional(),
  schedule: z.object({
    sendNow: z.boolean().optional(),
    scheduledAt: z.coerce.date().optional().nullable(),
    timezone: z.string().max(64).optional(),
    sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    skipWeekends: z.boolean().optional(),
    dailyLimit: z.number().int().min(1).max(2000).optional(),
    hourlyLimit: z.number().int().min(1).max(500).optional(),
    delayBetweenEmailsSec: z.number().int().min(5).max(3600).optional(),
  }).optional(),
});
export const updateCampaignSchema = campaignSchema.partial();

/* ---------- sequences ---------- */
export const sequenceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  provider: z.enum(['gmail', 'brevo']).optional(),
  connectionId: objectId.optional(),
  settings: z.object({
    sendingWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    sendingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    skipWeekends: z.boolean().optional(),
    timezone: z.string().max(64).optional(),
    stopOnReply: z.boolean().optional(),
    stopOnMeetingBooked: z.boolean().optional(),
    stopOnUnsubscribe: z.boolean().optional(),
    stopOnBounce: z.boolean().optional(),
  }).optional(),
});
export const stepSchema = z.object({
  order: z.number().int().min(1).max(50),
  name: z.string().max(160).optional(),
  subject: z.string().max(300).optional(),
  bodyHtml: z.string().max(200000).optional(),
  bodyText: z.string().max(100000).optional(),
  templateId: objectId.optional().nullable(),
  delayDays: z.number().int().min(0).max(90).optional(),
  delayHours: z.number().int().min(0).max(23).optional(),
  replyToThread: z.boolean().optional(),
  conditions: z.object({
    skipIfReplied: z.boolean().optional(),
    skipIfMeetingBooked: z.boolean().optional(),
    skipIfUnsubscribed: z.boolean().optional(),
    skipIfBounced: z.boolean().optional(),
  }).optional(),
});
export const enrollSchema = z.object({
  contactIds: z.array(objectId).max(5000).optional(),
  listIds: z.array(objectId).max(20).optional(),
}).refine((d) => d.contactIds?.length || d.listIds?.length, { message: 'Provide contacts or lists to enroll' });

/* ---------- automations ---------- */
export const automationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  conditions: z.array(z.object({
    field: z.string().min(1).max(60),
    operator: z.enum(['equals', 'not_equals', 'contains', 'in', 'gt', 'gte', 'lt', 'lte']),
    value: z.any(),
  })).max(10).optional(),
  actions: z.array(z.object({
    type: z.enum(AUTOMATION_ACTIONS),
    params: z.record(z.string(), z.any()).optional(),
  })).min(1).max(10),
});

/* ---------- inbox ---------- */
export const replySchema = z.object({
  bodyHtml: z.string().max(200000).optional(),
  bodyText: z.string().max(100000).optional(),
  subject: z.string().max(300).optional(),
  to: z.array(z.object({ name: z.string().optional(), email })).optional(),
  cc: z.array(z.object({ name: z.string().optional(), email })).optional(),
  replyAll: z.boolean().optional(),
  asDraft: z.boolean().optional(),
}).refine((d) => d.bodyHtml || d.bodyText, { message: 'Message body is required' });
export const composeSchema = z.object({
  connectionId: objectId,
  to: z.array(z.object({ name: z.string().optional(), email })).min(1),
  cc: z.array(z.object({ name: z.string().optional(), email })).optional(),
  subject: z.string().max(300),
  bodyHtml: z.string().max(200000).optional(),
  bodyText: z.string().max(100000).optional(),
  asDraft: z.boolean().optional(),
  contactId: objectId.optional(),
}).refine((d) => d.bodyHtml || d.bodyText, { message: 'Message body is required' });

/* ---------- appointments ---------- */
export const appointmentSchema = z.object({
  contactId: objectId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  location: shortText.optional(),
  meetingLink: z.string().url().optional().or(z.literal('')),
  assignedTo: objectId.optional(),
  sendConfirmation: z.boolean().optional(),
});
export const updateAppointmentSchema = appointmentSchema.partial().extend({
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show']).optional(),
});

/* ---------- integrations ---------- */
export const brevoConnectSchema = z.object({
  apiKey: z.string().trim().min(10, 'Enter your Brevo API key'),
  defaultSenderName: z.string().trim().min(1).max(120),
  defaultSenderEmail: email,
  replyToEmail: email.optional().or(z.literal('')),
  senderId: z.string().max(60).optional(),
  webhookSecret: z.string().max(200).optional(),
});

/* ---------- ai ---------- */
export const aiGenerateSchema = z.object({
  mode: z.enum(['email', 'subject', 'follow_up', 'reply', 'shorten', 'professional', 'friendly', 'grammar', 'personalize', 'summarize']),
  prompt: z.string().max(4000).optional(),
  context: z.record(z.string(), z.any()).optional(),
});

/* ---------- suppression ---------- */
export const suppressSchema = z.object({
  email,
  reason: z.enum(['unsubscribed', 'requested', 'spam_complaint', 'hard_bounce', 'manual_block']).optional(),
  note: z.string().max(500).optional(),
});

/* ---------- billing ---------- */
export const changePlanSchema = z.object({
  plan: z.enum(['free', 'starter', 'growth', 'scale']),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
});

/* ---------- follow-ups / calling ---------- */
export const followUpSchema = z.object({
  contactId: objectId,
  type: z.enum(['email', 'call', 'ai_call', 'task']).optional(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).optional(),
  dueAt: z.coerce.date().optional(),
  assignedTo: objectId.optional(),
});
export const callOutcomeSchema = z.object({
  externalCallId: z.string().max(120).optional(),
  followUpId: objectId.optional(),
  result: z.string().max(200),
  durationSec: z.number().int().min(0).optional(),
  recordingUrl: z.string().url().optional(),
  transcriptSummary: z.string().max(4000).optional(),
  contactStatus: z.enum(CONTACT_STATUSES).optional(),
  sendFollowUpEmail: z.boolean().optional(),
}).refine((d) => d.externalCallId || d.followUpId, { message: 'externalCallId or followUpId required' });
