import { EmailThread } from '../models/EmailThread.js';
import { EmailMessage } from '../models/EmailMessage.js';
import { EmailConnection } from '../models/EmailConnection.js';
import { Contact } from '../models/Contact.js';
import { ApiError } from '../utils/ApiError.js';
import { catchAsync } from '../utils/catchAsync.js';
import { ok, paginated } from '../utils/response.js';
import { parsePagination } from '../utils/pagination.js';
import { sendGmail, createGmailDraft, modifyThread, listLabels } from '../integrations/gmail/gmailService.js';
import { enqueueGmailSync } from '../queues/index.js';
import { audit } from '../services/auditService.js';

const FOLDER_FILTERS = {
  inbox: { isArchived: false },
  unread: { unreadCount: { $gt: 0 }, isArchived: false },
  sent: { lastOutboundAt: { $exists: true, $ne: null } },
  drafts: {},         // handled via messages
  starred: { isStarred: true },
  archived: { isArchived: true },
  interested: { lastClassification: { $in: ['interested', 'meeting_request', 'pricing_question', 'more_information'] } },
  needs_response: { needsResponse: true, isArchived: false },
  automated: { lastClassification: { $in: ['out_of_office', 'automatic_reply'] } },
};

export const listThreads = catchAsync(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30 });
  const { folder = 'inbox', connectionId, search, status, assignedTo, from, to, label } = req.query;

  if (folder === 'drafts') return listDrafts(req, res);

  const filter = { workspaceId: req.workspaceId, ...(FOLDER_FILTERS[folder] || FOLDER_FILTERS.inbox) };
  if (connectionId) filter.connectionId = connectionId;
  if (label) filter.labels = label;
  if (assignedTo === 'me') filter.assignedTo = req.user._id;
  else if (assignedTo) filter.assignedTo = assignedTo;
  if (req.role === 'sales') filter.$or = [{ assignedTo: req.user._id }, { assignedTo: null }];
  if (from || to) {
    filter.lastMessageAt = {};
    if (from) filter.lastMessageAt.$gte = new Date(String(from));
    if (to) filter.lastMessageAt.$lte = new Date(String(to));
  }
  if (search) {
    const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and = [{ $or: [{ subject: rx }, { snippet: rx }, { 'participants.email': rx }, { 'participants.name': rx }] }];
  }
  if (status) {
    const contactIds = await Contact.find({ workspaceId: req.workspaceId, status: { $in: String(status).split(',') } }).distinct('_id');
    filter.contactId = { $in: contactIds };
  }

  const [items, total] = await Promise.all([
    EmailThread.find(filter).sort('-lastMessageAt').skip(skip).limit(limit)
      .populate('contactId', 'firstName lastName email company status leadScore tags assignedTo')
      .populate('assignedTo', 'name email')
      .populate('campaignId', 'name'),
    EmailThread.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
});

async function listDrafts(req, res) {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 30 });
  const filter = { workspaceId: req.workspaceId, isDraft: true };
  if (req.query.connectionId) filter.connectionId = req.query.connectionId;
  const [items, total] = await Promise.all([
    EmailMessage.find(filter).sort('-createdAt').skip(skip).limit(limit).populate('contactId', 'firstName lastName email'),
    EmailMessage.countDocuments(filter),
  ]);
  return paginated(res, { items, total, page, limit });
}

export const inboxCounts = catchAsync(async (req, res) => {
  const base = { workspaceId: req.workspaceId };
  const [inbox, unread, starred, archived, needsResponse, interested, drafts] = await Promise.all([
    EmailThread.countDocuments({ ...base, isArchived: false }),
    EmailThread.countDocuments({ ...base, unreadCount: { $gt: 0 }, isArchived: false }),
    EmailThread.countDocuments({ ...base, isStarred: true }),
    EmailThread.countDocuments({ ...base, isArchived: true }),
    EmailThread.countDocuments({ ...base, needsResponse: true, isArchived: false }),
    EmailThread.countDocuments({ ...base, lastClassification: { $in: ['interested', 'meeting_request', 'pricing_question', 'more_information'] } }),
    EmailMessage.countDocuments({ ...base, isDraft: true }),
  ]);
  return ok(res, { counts: { inbox, unread, starred, archived, needs_response: needsResponse, interested, drafts } });
});

export const getThread = catchAsync(async (req, res) => {
  const thread = await EmailThread.findOne({ _id: req.params.id, workspaceId: req.workspaceId })
    .populate('contactId')
    .populate('assignedTo', 'name email')
    .populate('campaignId', 'name')
    .populate('sequenceId', 'name');
  if (!thread) throw ApiError.notFound('Conversation not found.', 'THREAD_NOT_FOUND');
  const messages = await EmailMessage.find({ threadId: thread._id }).sort({ createdAt: 1 });
  return ok(res, { thread, messages });
});

export const replyToThread = catchAsync(async (req, res) => {
  const thread = await EmailThread.findOne({ _id: req.params.id, workspaceId: req.workspaceId }).populate('contactId');
  if (!thread) throw ApiError.notFound('Conversation not found.');
  const connection = await EmailConnection.findOne({ _id: thread.connectionId, workspaceId: req.workspaceId });
  if (!connection || connection.status === 'disconnected') {
    throw ApiError.badRequest('The Gmail account for this conversation is disconnected.', 'GMAIL_DISCONNECTED');
  }

  const lastInbound = await EmailMessage.findOne({ threadId: thread._id, direction: 'inbound' }).sort({ createdAt: -1 });
  const lastAny = await EmailMessage.findOne({ threadId: thread._id }).sort({ createdAt: -1 });
  const target = lastInbound || lastAny;

  let to = req.body.to;
  if (!to?.length) {
    to = lastInbound ? [lastInbound.from] : (thread.participants || []).filter((p) => p.email !== connection.email).slice(0, 1);
  }
  let cc = req.body.cc || [];
  if (req.body.replyAll && lastInbound) {
    cc = [...(lastInbound.to || []), ...(lastInbound.cc || [])].filter((p) => p.email !== connection.email && !to.some((t) => t.email === p.email));
  }
  const subject = req.body.subject || (thread.subject?.startsWith('Re:') ? thread.subject : `Re: ${thread.subject || ''}`);

  if (req.body.asDraft) {
    const draft = await createGmailDraft(connection._id, {
      to, cc, subject,
      bodyHtml: req.body.bodyHtml, bodyText: req.body.bodyText,
      threadId: thread.gmailThreadId,
      inReplyTo: target?.internetMessageId,
      references: target?.internetMessageId,
    });
    await EmailMessage.create({
      workspaceId: req.workspaceId, threadId: thread._id, contactId: thread.contactId?._id,
      connectionId: connection._id, provider: 'gmail', direction: 'outbound', status: 'draft',
      from: { name: connection.displayName, email: connection.email }, to, cc, subject,
      bodyHtml: req.body.bodyHtml, bodyText: req.body.bodyText,
      snippet: (req.body.bodyText || req.body.bodyHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 140),
      providerMessageId: draft.providerMessageId, gmailThreadId: thread.gmailThreadId,
      isDraft: true, sentByUser: req.user._id,
    });
    return ok(res, { draftId: draft.draftId }, 'Draft saved to Gmail.');
  }

  const result = await sendGmail(connection._id, {
    to, cc, subject,
    bodyHtml: req.body.bodyHtml, bodyText: req.body.bodyText,
    threadId: thread.gmailThreadId,
    inReplyTo: target?.internetMessageId,
    references: target?.internetMessageId,
  });

  const message = await EmailMessage.create({
    workspaceId: req.workspaceId, threadId: thread._id, contactId: thread.contactId?._id,
    connectionId: connection._id, provider: 'gmail', direction: 'outbound', status: 'sent',
    from: { name: connection.displayName, email: connection.email }, to, cc, subject,
    bodyHtml: req.body.bodyHtml, bodyText: req.body.bodyText,
    snippet: (req.body.bodyText || req.body.bodyHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 140),
    providerMessageId: result.providerMessageId, gmailThreadId: result.gmailThreadId,
    sentAt: new Date(), sentByUser: req.user._id,
  });

  thread.lastMessageAt = new Date();
  thread.lastOutboundAt = new Date();
  thread.needsResponse = false;
  thread.messageCount += 1;
  await thread.save();
  await audit(req, 'inbox.reply', { resourceType: 'thread', resourceId: thread._id });
  return ok(res, { message }, 'Reply sent.');
});

export const composeEmail = catchAsync(async (req, res) => {
  const { connectionId, to, cc, subject, bodyHtml, bodyText, asDraft, contactId } = req.body;
  const connection = await EmailConnection.findOne({ _id: connectionId, workspaceId: req.workspaceId, provider: 'gmail' });
  if (!connection || connection.status === 'disconnected') {
    throw ApiError.badRequest('Select a connected Gmail account.', 'GMAIL_DISCONNECTED');
  }
  const contact = contactId
    ? await Contact.findOne({ _id: contactId, workspaceId: req.workspaceId })
    : await Contact.findOne({ workspaceId: req.workspaceId, email: to[0].email });

  if (asDraft) {
    const draft = await createGmailDraft(connection._id, { to, cc, subject, bodyHtml, bodyText });
    return ok(res, { draftId: draft.draftId }, 'Draft created in Gmail.');
  }
  const result = await sendGmail(connection._id, { to, cc, subject, bodyHtml, bodyText });
  const thread = await EmailThread.findOneAndUpdate(
    { workspaceId: req.workspaceId, connectionId: connection._id, gmailThreadId: result.gmailThreadId },
    {
      $set: {
        subject, snippet: (bodyText || bodyHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 140),
        contactId: contact?._id, provider: 'gmail', lastMessageAt: new Date(), lastOutboundAt: new Date(),
      },
      $setOnInsert: { workspaceId: req.workspaceId, connectionId: connection._id, gmailThreadId: result.gmailThreadId },
      $inc: { messageCount: 1 },
    },
    { upsert: true, new: true }
  );
  const message = await EmailMessage.create({
    workspaceId: req.workspaceId, threadId: thread._id, contactId: contact?._id,
    connectionId: connection._id, provider: 'gmail', direction: 'outbound', status: 'sent',
    from: { name: connection.displayName, email: connection.email }, to, cc, subject, bodyHtml, bodyText,
    snippet: (bodyText || bodyHtml || '').replace(/<[^>]+>/g, ' ').slice(0, 140),
    providerMessageId: result.providerMessageId, gmailThreadId: result.gmailThreadId,
    sentAt: new Date(), sentByUser: req.user._id,
  });
  if (contact) {
    contact.lastContactedAt = new Date();
    if (contact.status === 'new') contact.status = 'contacted';
    if (!contact.gmailThreadIds.includes(result.gmailThreadId)) contact.gmailThreadIds.push(result.gmailThreadId);
    await contact.save();
  }
  return ok(res, { message, threadId: thread._id }, 'Email sent.');
});

export const threadAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const thread = await EmailThread.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!thread) throw ApiError.notFound('Conversation not found.');
  const hasGmail = thread.gmailThreadId && thread.connectionId;

  switch (action) {
    case 'archive':
      thread.isArchived = true;
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { removeLabelIds: ['INBOX'] }).catch(() => {});
      break;
    case 'unarchive':
      thread.isArchived = false;
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { addLabelIds: ['INBOX'] }).catch(() => {});
      break;
    case 'read':
      thread.unreadCount = 0;
      await EmailMessage.updateMany({ threadId: thread._id }, { $set: { isRead: true } });
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { removeLabelIds: ['UNREAD'] }).catch(() => {});
      break;
    case 'unread':
      thread.unreadCount = Math.max(1, thread.unreadCount);
      await EmailMessage.findOneAndUpdate({ threadId: thread._id, direction: 'inbound' }, { $set: { isRead: false } }, { sort: { createdAt: -1 } });
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { addLabelIds: ['UNREAD'] }).catch(() => {});
      break;
    case 'star':
      thread.isStarred = true;
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { addLabelIds: ['STARRED'] }).catch(() => {});
      break;
    case 'unstar':
      thread.isStarred = false;
      if (hasGmail) await modifyThread(thread.connectionId, thread.gmailThreadId, { removeLabelIds: ['STARRED'] }).catch(() => {});
      break;
    case 'assign':
      thread.assignedTo = req.body.userId || null;
      break;
    case 'label': {
      const { label, remove } = req.body;
      if (!label) throw ApiError.badRequest('Label required.');
      if (remove) thread.labels = thread.labels.filter((l) => l !== label);
      else if (!thread.labels.includes(label)) thread.labels.push(label);
      break;
    }
    case 'resolve':
      thread.needsResponse = false;
      break;
    default:
      throw ApiError.badRequest(`Unknown action "${action}".`);
  }
  await thread.save();
  return ok(res, { thread }, 'Done.');
});

export const gmailLabels = catchAsync(async (req, res) => {
  const connection = await EmailConnection.findOne({ _id: req.params.connectionId, workspaceId: req.workspaceId, provider: 'gmail' });
  if (!connection) throw ApiError.notFound('Gmail account not found.');
  const labels = await listLabels(connection._id);
  return ok(res, { labels: labels.filter((l) => l.type === 'user').map((l) => ({ id: l.id, name: l.name })) });
});

export const syncNow = catchAsync(async (req, res) => {
  const connections = await EmailConnection.find({ workspaceId: req.workspaceId, provider: 'gmail', status: { $in: ['connected', 'unhealthy'] } });
  if (!connections.length) throw ApiError.badRequest('No connected Gmail account to sync.', 'GMAIL_NOT_CONNECTED');
  for (const c of connections) await enqueueGmailSync(c._id, { initial: !c.initialSyncDone });
  return ok(res, {}, 'Sync started. New mail will appear shortly.');
});
