import { EmailTemplate } from '../models/EmailTemplate.js';
import { Contact } from '../models/Contact.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, created, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { extractVariables, buildVariableContext, renderTemplate } from '../utils/personalization.js';
import { sendGmail } from '../integrations/gmail/gmailService.js';
import { sendTransactionalEmail } from '../integrations/brevo/brevoService.js';

export const listTemplates = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = { workspaceId: req.workspaceId, isArchived: req.query.archived === 'true' };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.name = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [items, total] = await Promise.all([
    EmailTemplate.find(filter).sort('-updatedAt').skip(skip).limit(limit),
    EmailTemplate.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

export const createTemplate = catchAsync(async (req, res) => {
  const variables = [...new Set([...extractVariables(req.body.subject), ...extractVariables(req.body.bodyHtml || req.body.bodyText)])];
  const template = await EmailTemplate.create({ ...req.body, variables, workspaceId: req.workspaceId, createdBy: req.user._id });
  return created(res, { template }, 'Template saved.');
});

export const getTemplate = catchAsync(async (req, res) => {
  const template = await EmailTemplate.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!template) throw ApiError.notFound('Template not found.');
  return ok(res, { template });
});

export const updateTemplate = catchAsync(async (req, res) => {
  const template = await EmailTemplate.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!template) throw ApiError.notFound('Template not found.');
  Object.assign(template, req.body);
  template.variables = [...new Set([...extractVariables(template.subject), ...extractVariables(template.bodyHtml || template.bodyText)])];
  await template.save();
  return ok(res, { template }, 'Template updated.');
});

export const deleteTemplate = catchAsync(async (req, res) => {
  const template = await EmailTemplate.findOneAndUpdate(
    { _id: req.params.id, workspaceId: req.workspaceId },
    { $set: { isArchived: true } },
    { new: true }
  );
  if (!template) throw ApiError.notFound('Template not found.');
  return ok(res, {}, 'Template archived.');
});

export const duplicateTemplate = catchAsync(async (req, res) => {
  const source = await EmailTemplate.findOne({ _id: req.params.id, workspaceId: req.workspaceId }).lean();
  if (!source) throw ApiError.notFound('Template not found.');
  const { _id, createdAt, updatedAt, usageCount, ...rest } = source;
  const template = await EmailTemplate.create({ ...rest, name: `${source.name} (copy)`, createdBy: req.user._id });
  return created(res, { template }, 'Template duplicated.');
});

/** Renders template with a real or sample contact for preview. */
export const previewTemplate = catchAsync(async (req, res) => {
  const { subject = '', bodyHtml = '', bodyText = '', contactId } = req.body;
  const contact = contactId
    ? await Contact.findOne({ _id: contactId, workspaceId: req.workspaceId })
    : { firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com', company: 'Acme Inc', jobTitle: 'Head of Growth', city: 'Austin', country: 'USA', customFields: {} };
  const ctx = buildVariableContext(contact, { sender_name: req.user.name, appointment_link: req.workspace.bookingLink || 'https://cal.example.com/you' });
  const s = renderTemplate(subject, ctx);
  const h = renderTemplate(bodyHtml, ctx);
  const t = renderTemplate(bodyText, ctx);
  return ok(res, {
    subject: s.output,
    bodyHtml: h.output,
    bodyText: t.output,
    missingVariables: [...new Set([...s.missing, ...h.missing, ...t.missing])],
  });
});

/** Sends a test email of arbitrary content to the requesting user. */
export const sendTestEmail = catchAsync(async (req, res) => {
  const { to, connectionId, subject = '(test)', bodyHtml, bodyText } = req.body;
  const connection = await EmailConnection.findOne({ _id: connectionId, workspaceId: req.workspaceId });
  if (!connection || connection.status === 'disconnected') {
    throw ApiError.badRequest('The selected sending account is not connected.', 'CONNECTION_UNAVAILABLE');
  }
  const sample = { firstName: 'Alex', lastName: 'Morgan', email: to, company: 'Acme Inc', jobTitle: 'Head of Growth', customFields: {} };
  const ctx = buildVariableContext(sample, { sender_name: req.user.name, appointment_link: req.workspace.bookingLink || '' });
  const subjectR = renderTemplate(`[TEST] ${subject}`, ctx).output;
  const htmlR = renderTemplate(bodyHtml || '', ctx).output;
  const textR = renderTemplate(bodyText || '', ctx).output;

  if (connection.provider === 'gmail') {
    await sendGmail(connection._id, { to: [{ email: to }], subject: subjectR, bodyHtml: htmlR, bodyText: textR });
  } else {
    await sendTransactionalEmail(req.workspaceId, { to: [{ email: to }], subject: subjectR, htmlContent: htmlR || undefined, textContent: textR || undefined, tags: ['test-email'] });
  }
  return ok(res, {}, `Test email sent to ${to}.`);
});
