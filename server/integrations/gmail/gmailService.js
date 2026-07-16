import { getAuthorizedClient, gmailApi } from './oauthClient.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/* ---------------- MIME helpers ---------------- */

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeaderWord(value) {
  return /[^\x20-\x7E]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : value;
}

function formatAddress({ name, email }) {
  return name ? `${encodeHeaderWord(name)} <${email}>` : email;
}

export function buildMime({ from, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references, attachments = [] }) {
  const boundaryAlt = `alt_${Date.now().toString(36)}`;
  const boundaryMixed = `mix_${Date.now().toString(36)}`;
  const headers = [
    `From: ${formatAddress(from)}`,
    `To: ${(to || []).map(formatAddress).join(', ')}`,
    ...(cc?.length ? [`Cc: ${cc.map(formatAddress).join(', ')}`] : []),
    ...(bcc?.length ? [`Bcc: ${bcc.map(formatAddress).join(', ')}`] : []),
    `Subject: ${encodeHeaderWord(subject || '')}`,
    'MIME-Version: 1.0',
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references ? [`References: ${references}`] : []),
  ];

  const text = bodyText || String(bodyHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    '',
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(bodyHtml || `<div>${text}</div>`, 'utf8').toString('base64'),
    `--${boundaryAlt}--`,
  ].join('\r\n');

  let raw;
  if (attachments.length) {
    const parts = attachments.map((a) =>
      [
        `--${boundaryMixed}`,
        `Content-Type: ${a.mimeType || 'application/octet-stream'}; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`,
        '',
        a.content.toString('base64'),
      ].join('\r\n')
    );
    raw = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
      '',
      `--${boundaryMixed}`,
      altPart,
      ...parts,
      `--${boundaryMixed}--`,
    ].join('\r\n');
  } else {
    raw = [...headers, altPart].join('\r\n');
  }
  return b64url(raw);
}

/* ---------------- Message parsing ---------------- */

function header(payload, name) {
  return payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export function parseAddressList(value) {
  if (!value) return [];
  return value.split(',').map((part) => {
    const m = part.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/) || part.match(/^\s*()([^\s]+@[^\s]+)\s*$/);
    if (!m) return { name: part.trim(), email: part.trim() };
    return { name: (m[1] || '').trim(), email: m[2].trim().toLowerCase() };
  }).filter((a) => a.email);
}

function walkParts(part, out) {
  if (!part) return;
  const mime = part.mimeType || '';
  if (part.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
    const decoded = Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    if (mime === 'text/html') out.html = out.html || decoded;
    else out.text = out.text || decoded;
  }
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({ filename: part.filename, mimeType: mime, size: part.body.size || 0, attachmentId: part.body.attachmentId });
  }
  (part.parts || []).forEach((p) => walkParts(p, out));
}

export function parseGmailMessage(msg) {
  const payload = msg.payload || {};
  const out = { html: '', text: '', attachments: [] };
  walkParts(payload, out);
  return {
    providerMessageId: msg.id,
    gmailThreadId: msg.threadId,
    gmailLabelIds: msg.labelIds || [],
    snippet: msg.snippet || '',
    internetMessageId: header(payload, 'Message-ID'),
    inReplyTo: header(payload, 'In-Reply-To'),
    references: header(payload, 'References'),
    subject: header(payload, 'Subject'),
    from: parseAddressList(header(payload, 'From'))[0] || { name: '', email: '' },
    to: parseAddressList(header(payload, 'To')),
    cc: parseAddressList(header(payload, 'Cc')),
    date: header(payload, 'Date') ? new Date(header(payload, 'Date')) : new Date(Number(msg.internalDate) || Date.now()),
    bodyHtml: out.html,
    bodyText: out.text,
    attachments: out.attachments,
    isUnread: (msg.labelIds || []).includes('UNREAD'),
    isStarred: (msg.labelIds || []).includes('STARRED'),
    isDraft: (msg.labelIds || []).includes('DRAFT'),
    isSent: (msg.labelIds || []).includes('SENT'),
    isInbox: (msg.labelIds || []).includes('INBOX'),
  };
}

/* ---------------- Gmail operations ---------------- */

export async function sendGmail(connectionId, { to, cc, bcc, subject, bodyHtml, bodyText, threadId, inReplyTo, references, attachments }) {
  const { client, connection } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const raw = buildMime({
    from: { name: connection.displayName || connection.email, email: connection.email },
    to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references, attachments,
  });
  const { data } = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(threadId ? { threadId } : {}) },
  });
  return { providerMessageId: data.id, gmailThreadId: data.threadId, labelIds: data.labelIds || [] };
}

export async function createGmailDraft(connectionId, { to, cc, subject, bodyHtml, bodyText, threadId, inReplyTo, references }) {
  const { client, connection } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const raw = buildMime({
    from: { name: connection.displayName || connection.email, email: connection.email },
    to, cc, subject, bodyHtml, bodyText, inReplyTo, references,
  });
  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw, ...(threadId ? { threadId } : {}) } },
  });
  return { draftId: data.id, providerMessageId: data.message?.id, gmailThreadId: data.message?.threadId };
}

export async function getMessage(connectionId, messageId) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return data;
}

export async function getThread(connectionId, threadId) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
  return data;
}

export async function listMessages(connectionId, { q, labelIds, maxResults = 50, pageToken } = {}) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.messages.list({ userId: 'me', q, labelIds, maxResults, pageToken });
  return data;
}

export async function listHistory(connectionId, startHistoryId) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.history.list({
    userId: 'me',
    startHistoryId,
    historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
    maxResults: 200,
  });
  return data;
}

export async function modifyMessage(connectionId, messageId, { addLabelIds = [], removeLabelIds = [] }) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds, removeLabelIds } });
  return data;
}

export async function modifyThread(connectionId, threadId, { addLabelIds = [], removeLabelIds = [] }) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds, removeLabelIds } });
  return data;
}

export async function listLabels(connectionId) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return data.labels || [];
}

export async function getProfile(connectionId) {
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.getProfile({ userId: 'me' });
  return data;
}

/** Registers Gmail push notifications via Cloud Pub/Sub. Returns null when not configured. */
export async function watchMailbox(connectionId) {
  if (!env.google.pubsubTopic) return null;
  const { client } = await getAuthorizedClient(connectionId);
  const gmail = gmailApi(client);
  const { data } = await gmail.users.watch({
    userId: 'me',
    requestBody: { topicName: env.google.pubsubTopic, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' },
  });
  logger.info(`Gmail watch registered for connection ${connectionId}, expires ${data.expiration}`);
  return data; // { historyId, expiration }
}

export async function stopWatch(connectionId) {
  try {
    const { client } = await getAuthorizedClient(connectionId);
    const gmail = gmailApi(client);
    await gmail.users.stop({ userId: 'me' });
  } catch (err) {
    logger.warn(`Gmail stop watch failed: ${err.message}`);
  }
}
