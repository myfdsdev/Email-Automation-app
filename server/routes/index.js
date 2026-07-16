import { Router } from 'express';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { requireWorkspace, requirePermission } from '../middleware/workspace.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, webhookLimiter } from '../middleware/rateLimiters.js';
import { importUpload } from '../middleware/upload.js';
import * as v from '../validators/schemas.js';
import { z } from 'zod';

import * as auth from '../controllers/authController.js';
import * as ws from '../controllers/workspaceController.js';
import * as contacts from '../controllers/contactController.js';
import * as imports from '../controllers/importController.js';
import * as lists from '../controllers/listController.js';
import * as templates from '../controllers/templateController.js';
import * as campaigns from '../controllers/campaignController.js';
import * as sequences from '../controllers/sequenceController.js';
import * as automations from '../controllers/automationController.js';
import * as inbox from '../controllers/inboxController.js';
import * as integrations from '../controllers/integrationController.js';
import * as misc from '../controllers/miscController.js';
import * as analytics from '../controllers/analyticsController.js';
import * as billing from '../controllers/billingController.js';
import * as admin from '../controllers/adminController.js';
import * as webhooks from '../controllers/webhookController.js';

export const router = Router();

/* ---------------- webhooks (public, rate limited) ---------------- */
router.post('/webhooks/brevo', webhookLimiter, webhooks.brevoWebhook);
router.post('/webhooks/gmail', webhookLimiter, webhooks.gmailWebhook);
// Calling-app integration inbound endpoint (authenticated with workspace context)
router.post('/webhooks/calling/outcome', requireAuth, requireWorkspace, validate({ body: v.callOutcomeSchema }), misc.receiveCallOutcome);

/* ---------------- auth ---------------- */
router.post('/auth/signup', authLimiter, validate({ body: v.signupSchema }), auth.signup);
router.post('/auth/login', authLimiter, validate({ body: v.loginSchema }), auth.login);
router.post('/auth/logout', auth.logout);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/forgot-password', authLimiter, validate({ body: v.forgotSchema }), auth.forgotPassword);
router.post('/auth/reset-password', authLimiter, validate({ body: v.resetSchema }), auth.resetPassword);
router.post('/auth/verify-email', validate({ body: v.verifyEmailSchema }), auth.verifyEmail);
router.post('/auth/resend-verification', requireAuth, auth.resendVerification);
router.get('/auth/me', requireAuth, auth.me);

/* ---------------- users ---------------- */
router.patch('/users/me', requireAuth, validate({ body: v.updateProfileSchema }), auth.updateProfile);

/* ---------------- workspaces ---------------- */
router.post('/workspaces', requireAuth, validate({ body: v.createWorkspaceSchema }), ws.createWorkspace);
router.get('/workspaces/current', requireAuth, requireWorkspace, ws.getWorkspace);
router.patch('/workspaces/current', requireAuth, requireWorkspace, requirePermission('workspace:manage'), validate({ body: v.updateWorkspaceSchema }), ws.updateWorkspace);

/* ---------------- team ---------------- */
router.get('/team', requireAuth, requireWorkspace, ws.listMembers);
router.post('/team/invite', requireAuth, requireWorkspace, requirePermission('team:manage'), validate({ body: v.inviteMemberSchema }), ws.inviteMember);
router.post('/team/accept-invite', requireAuth, validate({ body: z.object({ token: z.string().min(10) }) }), ws.acceptInvite);
router.patch('/team/:id', requireAuth, requireWorkspace, requirePermission('team:manage'), validate({ body: v.updateMemberSchema }), ws.updateMember);
router.delete('/team/:id', requireAuth, requireWorkspace, requirePermission('team:manage'), ws.removeMember);

/* ---------------- integrations ---------------- */
router.get('/integrations', requireAuth, requireWorkspace, integrations.listConnections);
router.get('/integrations/gmail/auth-url', requireAuth, requireWorkspace, requirePermission('integrations:manage'), integrations.gmailAuthUrl);
router.get('/integrations/gmail/callback', integrations.gmailCallback); // OAuth redirect (state-verified)
router.delete('/integrations/gmail/:id', requireAuth, requireWorkspace, requirePermission('integrations:manage'), integrations.disconnectGmail);
router.post('/integrations/gmail/:id/sync', requireAuth, requireWorkspace, integrations.gmailSyncNow);
router.post('/integrations/brevo', requireAuth, requireWorkspace, requirePermission('integrations:manage'), validate({ body: v.brevoConnectSchema }), integrations.connectBrevo);
router.delete('/integrations/brevo/:id', requireAuth, requireWorkspace, requirePermission('integrations:manage'), integrations.disconnectBrevo);
router.get('/integrations/brevo/senders', requireAuth, requireWorkspace, integrations.brevoSenders);
router.get('/integrations/brevo/lists', requireAuth, requireWorkspace, integrations.brevoLists);
router.post('/integrations/brevo/test', requireAuth, requireWorkspace, integrations.testBrevo);

/* ---------------- contacts ---------------- */
const cm = [requireAuth, requireWorkspace, requirePermission('contacts:manage')];
const cv = [requireAuth, requireWorkspace, requirePermission('contacts:view')];
router.get('/contacts', ...cv, contacts.listContacts);
router.get('/contacts/facets', ...cv, contacts.contactFacets);
router.get('/contacts/export', ...cm, contacts.exportContacts);
router.post('/contacts', ...cm, validate({ body: v.contactBody }), contacts.createContact);
router.post('/contacts/bulk', ...cm, validate({ body: v.bulkContactsSchema }), contacts.bulkAction);
router.get('/contacts/:id', ...cv, contacts.getContact);
router.patch('/contacts/:id', ...cm, validate({ body: v.updateContactSchema }), contacts.updateContact);
router.delete('/contacts/:id', ...cm, contacts.deleteContact);
router.post('/contacts/:id/notes', ...cv, validate({ body: v.addNoteSchema }), contacts.addNote);
router.get('/contacts/:id/timeline', ...cv, contacts.contactTimeline);

/* ---------------- contact import ---------------- */
router.post('/contacts/import/upload', ...cm, importUpload.single('file'), imports.uploadImportFile);
router.post('/contacts/import/validate', ...cm, imports.validateImportSession);
router.post('/contacts/import/confirm', ...cm, imports.confirmImport);

/* ---------------- lists & segments ---------------- */
router.get('/contact-lists', ...cv, lists.listLists);
router.post('/contact-lists', ...cm, validate({ body: v.listSchema }), lists.createList);
router.patch('/contact-lists/:id', ...cm, validate({ body: v.listSchema.partial() }), lists.updateList);
router.delete('/contact-lists/:id', ...cm, lists.deleteList);
router.get('/contact-lists/:id/contacts', ...cv, lists.listMembersOf);
router.post('/contact-lists/:id/contacts', ...cm, validate({ body: v.listContactsSchema }), lists.addContactsToList);
router.delete('/contact-lists/:id/contacts', ...cm, validate({ body: v.listContactsSchema }), lists.removeContactsFromList);
router.post('/contact-lists/:id/sync-brevo', ...cm, lists.syncListWithBrevo);

router.get('/segments', ...cv, lists.listSegments);
router.post('/segments', ...cm, validate({ body: v.segmentSchema }), lists.createSegment);
router.post('/segments/preview', ...cv, validate({ body: z.object({ filters: z.array(v.segmentFilterSchema) }) }), lists.previewSegment);
router.patch('/segments/:id', ...cm, validate({ body: v.segmentSchema.partial() }), lists.updateSegment);
router.delete('/segments/:id', ...cm, lists.deleteSegment);

/* ---------------- templates ---------------- */
const tm = [requireAuth, requireWorkspace, requirePermission('templates:manage')];
router.get('/templates', requireAuth, requireWorkspace, templates.listTemplates);
router.post('/templates', ...tm, validate({ body: v.templateSchema }), templates.createTemplate);
router.get('/templates/:id', requireAuth, requireWorkspace, templates.getTemplate);
router.patch('/templates/:id', ...tm, validate({ body: v.templateSchema.partial() }), templates.updateTemplate);
router.delete('/templates/:id', ...tm, templates.deleteTemplate);
router.post('/templates/:id/duplicate', ...tm, templates.duplicateTemplate);
router.post('/templates/preview', requireAuth, requireWorkspace, templates.previewTemplate);
router.post('/templates/test-email', ...tm, validate({ body: v.testEmailSchema }), templates.sendTestEmail);

/* ---------------- campaigns ---------------- */
const cam = [requireAuth, requireWorkspace, requirePermission('campaigns:manage')];
router.get('/campaigns', requireAuth, requireWorkspace, campaigns.listCampaigns);
router.post('/campaigns', ...cam, validate({ body: v.campaignSchema }), campaigns.createCampaign);
router.get('/campaigns/:id', requireAuth, requireWorkspace, campaigns.getCampaign);
router.patch('/campaigns/:id', ...cam, validate({ body: v.updateCampaignSchema }), campaigns.updateCampaign);
router.get('/campaigns/:id/review', ...cam, campaigns.reviewCampaignHandler);
router.post('/campaigns/:id/actions/:action', ...cam, campaigns.campaignAction);
router.get('/campaigns/:id/report', requireAuth, requireWorkspace, requirePermission('analytics:view'), campaigns.campaignReport);
router.get('/campaigns/:id/recipients', requireAuth, requireWorkspace, campaigns.campaignRecipients);

/* ---------------- sequences ---------------- */
const seq = [requireAuth, requireWorkspace, requirePermission('sequences:manage')];
router.get('/sequences', requireAuth, requireWorkspace, sequences.listSequences);
router.post('/sequences', ...seq, validate({ body: v.sequenceSchema }), sequences.createSequence);
router.get('/sequences/:id', requireAuth, requireWorkspace, sequences.getSequence);
router.patch('/sequences/:id', ...seq, validate({ body: v.sequenceSchema.partial() }), sequences.updateSequence);
router.post('/sequences/:id/actions/:action', ...seq, sequences.sequenceAction);
router.put('/sequences/:id/steps', ...seq, validate({ body: v.stepSchema }), sequences.upsertStep);
router.delete('/sequences/:id/steps/:stepId', ...seq, sequences.deleteStep);
router.post('/sequences/:id/enroll', ...seq, validate({ body: v.enrollSchema }), sequences.enroll);
router.get('/sequences/:id/enrollments', requireAuth, requireWorkspace, sequences.listEnrollments);
router.post('/sequences/:id/enrollments/:enrollmentId/:action', ...seq, sequences.enrollmentAction);
router.get('/sequences/:id/report', requireAuth, requireWorkspace, requirePermission('analytics:view'), sequences.sequenceReport);

/* ---------------- automations ---------------- */
const am = [requireAuth, requireWorkspace, requirePermission('automations:manage')];
router.get('/automations/meta', requireAuth, requireWorkspace, automations.automationMeta);
router.get('/automations', requireAuth, requireWorkspace, automations.listAutomations);
router.post('/automations', ...am, validate({ body: v.automationSchema }), automations.createAutomation);
router.get('/automations/executions', requireAuth, requireWorkspace, automations.listExecutions);
router.get('/automations/:id', requireAuth, requireWorkspace, automations.getAutomation);
router.patch('/automations/:id', ...am, validate({ body: v.automationSchema.partial() }), automations.updateAutomation);
router.delete('/automations/:id', ...am, automations.deleteAutomation);
router.post('/automations/:id/status', ...am, automations.setAutomationStatus);
router.get('/automations/:id/executions', requireAuth, requireWorkspace, automations.listExecutions);

/* ---------------- inbox ---------------- */
const ib = [requireAuth, requireWorkspace, requirePermission('inbox:view')];
const ibr = [requireAuth, requireWorkspace, requirePermission('inbox:reply')];
router.get('/inbox/threads', ...ib, inbox.listThreads);
router.get('/inbox/counts', ...ib, inbox.inboxCounts);
router.get('/inbox/threads/:id', ...ib, inbox.getThread);
router.post('/inbox/threads/:id/reply', ...ibr, validate({ body: v.replySchema }), inbox.replyToThread);
router.post('/inbox/threads/:id/actions/:action', ...ib, inbox.threadAction);
router.post('/inbox/compose', ...ibr, validate({ body: v.composeSchema }), inbox.composeEmail);
router.get('/inbox/labels/:connectionId', ...ib, inbox.gmailLabels);
router.post('/inbox/sync', ...ib, inbox.syncNow);

/* ---------------- email messages / events ---------------- */
router.get('/email-messages/upcoming', requireAuth, requireWorkspace, misc.upcomingEmails);
router.get('/email-messages/:id/timeline', requireAuth, requireWorkspace, analytics.messageTimeline);

/* ---------------- appointments ---------------- */
const ap = [requireAuth, requireWorkspace, requirePermission('appointments:manage')];
router.get('/appointments', requireAuth, requireWorkspace, misc.listAppointments);
router.post('/appointments', ...ap, validate({ body: v.appointmentSchema }), misc.createAppointment);
router.patch('/appointments/:id', ...ap, validate({ body: v.updateAppointmentSchema }), misc.updateAppointment);
router.delete('/appointments/:id', ...ap, misc.deleteAppointment);

/* ---------------- follow-ups (incl. AI-call tasks) ---------------- */
router.get('/follow-ups', requireAuth, requireWorkspace, misc.listFollowUps);
router.post('/follow-ups', requireAuth, requireWorkspace, validate({ body: v.followUpSchema }), misc.createFollowUp);
router.patch('/follow-ups/:id', requireAuth, requireWorkspace, misc.updateFollowUp);

/* ---------------- suppression ---------------- */
const sup = [requireAuth, requireWorkspace, requirePermission('suppression:manage')];
router.get('/suppression', requireAuth, requireWorkspace, misc.listSuppression);
router.post('/suppression', ...sup, validate({ body: v.suppressSchema }), misc.addSuppression);
router.delete('/suppression/:id', ...sup, misc.removeSuppression);

/* ---------------- notifications ---------------- */
router.get('/notifications', requireAuth, requireWorkspace, misc.listNotifications);
router.post('/notifications/read-all', requireAuth, requireWorkspace, misc.markAllNotificationsRead);
router.post('/notifications/:id/read', requireAuth, requireWorkspace, misc.markNotificationRead);

/* ---------------- AI ---------------- */
router.post('/ai/generate', requireAuth, requireWorkspace, validate({ body: v.aiGenerateSchema }), misc.aiGenerate);

/* ---------------- search ---------------- */
router.get('/search', requireAuth, requireWorkspace, misc.globalSearch);

/* ---------------- analytics ---------------- */
const an = [requireAuth, requireWorkspace, requirePermission('analytics:view')];
router.get('/analytics/overview', ...an, analytics.overview);
router.get('/analytics/performance', ...an, analytics.performance);
router.get('/analytics/providers', ...an, analytics.providers);
router.get('/analytics/replies', ...an, analytics.replyBreakdown);
router.get('/analytics/team', ...an, analytics.team);
router.get('/analytics/health', ...an, analytics.health);
router.get('/analytics/dashboard-panels', ...an, analytics.dashboardPanels);

/* ---------------- billing ---------------- */
router.get('/billing', requireAuth, requireWorkspace, billing.getBilling);
router.post('/billing/change-plan', requireAuth, requireWorkspace, requirePermission('billing:manage'), validate({ body: v.changePlanSchema }), billing.changePlan);
router.post('/billing/cancel', requireAuth, requireWorkspace, requirePermission('billing:manage'), billing.cancelSubscription);

/* ---------------- admin ---------------- */
const ad = [requireAuth, requirePlatformAdmin];
router.get('/admin/dashboard', ...ad, admin.adminDashboard);
router.get('/admin/users', ...ad, admin.adminUsers);
router.patch('/admin/users/:id', ...ad, admin.adminUpdateUser);
router.get('/admin/workspaces', ...ad, admin.adminWorkspaces);
router.patch('/admin/workspaces/:id', ...ad, admin.adminUpdateWorkspace);
router.get('/admin/connections', ...ad, admin.adminConnections);
router.get('/admin/contacts', ...ad, admin.adminContactsList);
router.get('/admin/campaigns', ...ad, admin.adminCampaigns);
router.get('/admin/sequences', ...ad, admin.adminSequences);
router.get('/admin/automations', ...ad, admin.adminAutomations);
router.get('/admin/email-logs', ...ad, admin.adminEmailLogs);
router.get('/admin/webhooks', ...ad, admin.adminWebhooks);
router.post('/admin/webhooks/:id/retry', ...ad, admin.adminRetryWebhook);
router.get('/admin/jobs', ...ad, admin.adminJobs);
router.get('/admin/suppression', ...ad, admin.adminSuppression);
router.get('/admin/usage', ...ad, admin.adminUsage);
router.get('/admin/plans', ...ad, admin.adminPlans);
router.get('/admin/payments', ...ad, admin.adminPayments);
router.get('/admin/audit-logs', ...ad, admin.adminAuditLogs);
router.get('/admin/system', ...ad, admin.adminSystem);
