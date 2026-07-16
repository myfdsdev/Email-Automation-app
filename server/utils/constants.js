export const ROLES = ['owner', 'admin', 'sales', 'viewer'];

export const PERMISSIONS = {
  owner: [
    'billing:manage', 'integrations:manage', 'team:manage', 'workspace:manage',
    'contacts:manage', 'templates:manage', 'campaigns:manage', 'sequences:manage',
    'automations:manage', 'inbox:reply', 'inbox:view', 'analytics:view', 'contacts:view',
    'appointments:manage', 'suppression:manage',
  ],
  admin: [
    'contacts:manage', 'contacts:view', 'templates:manage', 'campaigns:manage',
    'sequences:manage', 'automations:manage', 'inbox:reply', 'inbox:view',
    'analytics:view', 'appointments:manage', 'suppression:manage',
  ],
  sales: ['contacts:view', 'inbox:view', 'inbox:reply', 'appointments:manage', 'analytics:view'],
  viewer: ['analytics:view', 'contacts:view', 'inbox:view'],
};

export const CONTACT_STATUSES = [
  'new', 'contacted', 'delivered', 'opened', 'clicked', 'replied', 'interested',
  'qualified', 'meeting_booked', 'not_interested', 'unsubscribed', 'bounced',
  'invalid', 'converted',
];

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed', 'archived'];

export const MESSAGE_STATUSES = [
  'queued', 'scheduled', 'sending', 'sent', 'delivered', 'opened', 'clicked',
  'replied', 'soft_bounce', 'hard_bounce', 'blocked', 'spam', 'unsubscribed', 'failed', 'cancelled', 'draft',
];

export const EVENT_TYPES = [
  'queued', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied',
  'soft_bounce', 'hard_bounce', 'blocked', 'spam_complaint', 'unsubscribed', 'failed', 'error',
];

export const REPLY_CLASSIFICATIONS = [
  'interested', 'pricing_question', 'more_information', 'meeting_request',
  'not_interested', 'unsubscribe', 'out_of_office', 'wrong_contact', 'referral',
  'complaint', 'support_request', 'automatic_reply', 'spam', 'unclassified',
];

export const AUTOMATION_TRIGGERS = [
  'contact_created', 'contact_imported', 'contact_status_changed', 'tag_added',
  'email_sent', 'email_delivered', 'email_opened', 'link_clicked', 'reply_received',
  'email_bounced', 'contact_unsubscribed', 'appointment_booked', 'sequence_completed',
  'ai_call_completed',
];

export const AUTOMATION_ACTIONS = [
  'send_gmail_email', 'send_brevo_email', 'create_gmail_draft', 'start_sequence',
  'stop_sequence', 'add_tag', 'remove_tag', 'update_contact_status', 'assign_member',
  'create_follow_up', 'send_booking_link', 'schedule_ai_call', 'notify_team', 'send_webhook',
];

export const TEMPLATE_CATEGORIES = [
  'cold_outreach', 'follow_up', 'newsletter', 'welcome', 'appointment_confirmation',
  'appointment_reminder', 'product_update', 'payment_reminder', 'reactivation', 'transactional',
];

export const SUPPRESSION_REASONS = ['unsubscribed', 'requested', 'spam_complaint', 'hard_bounce', 'manual_block'];

export const PLANS = {
  free: { name: 'Free', price: 0, contacts: 500, emailsPerMonth: 1000, gmailAccounts: 1, teamMembers: 2, activeSequences: 2, aiCreditsPerMonth: 50 },
  starter: { name: 'Starter', price: 29, contacts: 5000, emailsPerMonth: 15000, gmailAccounts: 2, teamMembers: 5, activeSequences: 10, aiCreditsPerMonth: 500 },
  growth: { name: 'Growth', price: 79, contacts: 25000, emailsPerMonth: 75000, gmailAccounts: 5, teamMembers: 15, activeSequences: 50, aiCreditsPerMonth: 2000 },
  scale: { name: 'Scale', price: 199, contacts: 100000, emailsPerMonth: 300000, gmailAccounts: 15, teamMembers: 50, activeSequences: 200, aiCreditsPerMonth: 10000 },
};

export const USAGE_METRICS = ['contacts', 'emails_sent', 'ai_generations', 'ai_analyses', 'gmail_accounts', 'team_members', 'active_sequences'];
