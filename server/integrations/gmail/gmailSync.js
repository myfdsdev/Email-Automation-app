import { EmailConnection } from '../../models/EmailConnection.js';
import { EmailMessage } from '../../models/EmailMessage.js';
import { EmailThread } from '../../models/EmailThread.js';
import { Contact } from '../../models/Contact.js';
import { listMessages, getMessage, listHistory, parseGmailMessage, getProfile } from './gmailService.js';
import { handleIncomingReply } from '../../services/replyService.js';
import { logger } from '../../utils/logger.js';

/** Upserts one Gmail message + its thread. Returns { message, isNew, isIncomingReply }. */
export async function ingestGmailMessage(connection, rawMsg) {
  const parsed = parseGmailMessage(rawMsg);
  const workspaceId = connection.workspaceId;

  const existing = await EmailMessage.findOne({
    workspaceId,
    provider: 'gmail',
    providerMessageId: parsed.providerMessageId,
  });

  const direction = parsed.from?.email === connection.email ? 'outbound' : 'inbound';

  // Match the counterparty with a contact
  const counterpartyEmail = direction === 'inbound' ? parsed.from?.email : parsed.to?.[0]?.email;
  const contact = counterpartyEmail
    ? await Contact.findOne({ workspaceId, email: counterpartyEmail.toLowerCase() })
    : null;

  // Upsert thread
  const threadUpdate = {
    $set: {
      subject: parsed.subject || '(no subject)',
      snippet: parsed.snippet,
      lastMessageAt: parsed.date,
      provider: 'gmail',
    },
    $setOnInsert: { workspaceId, connectionId: connection._id, gmailThreadId: parsed.gmailThreadId },
    $addToSet: { participants: { $each: [parsed.from, ...(parsed.to || [])].filter((p) => p?.email) } },
  };
  if (contact) threadUpdate.$set.contactId = contact._id;
  if (direction === 'inbound') {
    threadUpdate.$set.lastInboundAt = parsed.date;
    threadUpdate.$set.needsResponse = true;
  } else {
    threadUpdate.$set.lastOutboundAt = parsed.date;
  }
  if (parsed.attachments.length) threadUpdate.$set.hasAttachments = true;

  const thread = await EmailThread.findOneAndUpdate(
    { workspaceId, connectionId: connection._id, gmailThreadId: parsed.gmailThreadId },
    threadUpdate,
    { upsert: true, new: true }
  );

  if (existing) {
    // Label-state refresh only (read/unread/starred changes)
    existing.gmailLabelIds = parsed.gmailLabelIds;
    existing.isRead = !parsed.isUnread;
    existing.isStarred = parsed.isStarred;
    await existing.save();
    await recountThreadUnread(thread);
    return { message: existing, thread, isNew: false, isIncomingReply: false };
  }

  const message = await EmailMessage.create({
    workspaceId,
    threadId: thread._id,
    contactId: contact?._id,
    connectionId: connection._id,
    provider: 'gmail',
    direction,
    status: parsed.isDraft ? 'draft' : direction === 'inbound' ? 'delivered' : 'sent',
    from: parsed.from,
    to: parsed.to,
    cc: parsed.cc,
    subject: parsed.subject,
    bodyHtml: parsed.bodyHtml,
    bodyText: parsed.bodyText,
    snippet: parsed.snippet,
    attachments: parsed.attachments,
    providerMessageId: parsed.providerMessageId,
    gmailThreadId: parsed.gmailThreadId,
    gmailLabelIds: parsed.gmailLabelIds,
    internetMessageId: parsed.internetMessageId,
    inReplyTo: parsed.inReplyTo,
    isRead: !parsed.isUnread,
    isStarred: parsed.isStarred,
    isDraft: parsed.isDraft,
    sentAt: direction === 'outbound' ? parsed.date : undefined,
    deliveredAt: direction === 'inbound' ? parsed.date : undefined,
    createdAt: parsed.date,
  });

  thread.messageCount += 1;
  await thread.save();
  await recountThreadUnread(thread);

  // An inbound message on a thread where we previously sent = a reply
  const isIncomingReply = direction === 'inbound' && !parsed.isDraft;
  if (isIncomingReply) {
    try {
      await handleIncomingReply({ connection, message, thread, contact });
    } catch (err) {
      logger.error(`Reply pipeline failed for message ${message._id}: ${err.message}`);
    }
  }

  return { message, thread, isNew: true, isIncomingReply };
}

async function recountThreadUnread(thread) {
  const unread = await EmailMessage.countDocuments({ threadId: thread._id, isRead: false, direction: 'inbound' });
  if (thread.unreadCount !== unread) {
    thread.unreadCount = unread;
    await thread.save();
  }
}

/** Initial sync: recent inbox + sent mail (bounded). */
export async function initialSync(connectionId, { maxMessages = 200 } = {}) {
  const connection = await EmailConnection.findById(connectionId);
  if (!connection) throw new Error('Connection not found');
  logger.info(`Gmail initial sync started for ${connection.email}`);

  const profile = await getProfile(connectionId);
  let fetched = 0;
  let pageToken;

  do {
    const page = await listMessages(connectionId, {
      q: 'in:anywhere -in:chats -in:spam -in:trash newer_than:30d',
      maxResults: Math.min(100, maxMessages - fetched),
      pageToken,
    });
    const ids = page.messages || [];
    for (const m of ids) {
      try {
        const raw = await getMessage(connectionId, m.id);
        await ingestGmailMessage(connection, raw);
        fetched += 1;
      } catch (err) {
        logger.warn(`Skip message ${m.id}: ${err.message}`);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken && fetched < maxMessages);

  connection.gmailHistoryId = String(profile.historyId);
  connection.lastSyncAt = new Date();
  connection.initialSyncDone = true;
  connection.status = 'connected';
  await connection.save();
  logger.info(`Gmail initial sync finished for ${connection.email}: ${fetched} messages`);
  return { fetched };
}

/** Incremental sync using the Gmail history API from the stored historyId. */
export async function incrementalSync(connectionId) {
  const connection = await EmailConnection.findById(connectionId);
  if (!connection) throw new Error('Connection not found');
  if (!connection.gmailHistoryId) return initialSync(connectionId);

  let newMessages = 0;
  try {
    let pageToken;
    let latestHistoryId = connection.gmailHistoryId;
    do {
      const data = await listHistory(connectionId, connection.gmailHistoryId);
      latestHistoryId = data.historyId || latestHistoryId;
      const histories = data.history || [];
      const seen = new Set();
      for (const h of histories) {
        for (const added of [...(h.messagesAdded || []), ...(h.labelsAdded || []), ...(h.labelsRemoved || [])]) {
          const id = added.message?.id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          try {
            const raw = await getMessage(connectionId, id);
            const { isNew } = await ingestGmailMessage(connection, raw);
            if (isNew) newMessages += 1;
          } catch (err) {
            if (!/404/.test(err.message)) logger.warn(`History message ${id} failed: ${err.message}`);
          }
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    connection.gmailHistoryId = String(latestHistoryId);
    connection.lastSyncAt = new Date();
    if (connection.status === 'unhealthy') connection.status = 'connected';
    await connection.save();
  } catch (err) {
    // History expired (404) -> full re-sync
    if (err.code === 404 || /historyId/i.test(err.message) || /404/.test(String(err.message))) {
      logger.warn(`Gmail history expired for ${connection.email}; running full sync`);
      connection.gmailHistoryId = undefined;
      await connection.save();
      return initialSync(connectionId);
    }
    connection.status = 'unhealthy';
    connection.lastError = err.message;
    await connection.save();
    throw err;
  }
  return { newMessages };
}
