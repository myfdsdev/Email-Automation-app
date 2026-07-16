import { createBrevoClient, getBrevoClientForWorkspace } from './brevoClient.js';
import { Contact } from '../../models/Contact.js';
import { ContactList } from '../../models/ContactList.js';
import { logger } from '../../utils/logger.js';

export async function validateApiKey(apiKey) {
  const client = createBrevoClient(apiKey);
  const { data } = await client.get('/account');
  return {
    email: data.email,
    companyName: data.companyName,
    plan: data.plan?.[0]?.type || 'unknown',
  };
}

export async function fetchSenders(workspaceId) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  const { data } = await client.get('/senders');
  return (data.senders || []).map((s) => ({ id: s.id, name: s.name, email: s.email, active: s.active }));
}

export async function fetchLists(workspaceId) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  const { data } = await client.get('/contacts/lists', { params: { limit: 50 } });
  return (data.lists || []).map((l) => ({ id: l.id, name: l.name, totalSubscribers: l.totalSubscribers }));
}

export async function createBrevoList(workspaceId, name) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  let folderId = 1;
  try {
    const { data: folders } = await client.get('/contacts/folders', { params: { limit: 1 } });
    folderId = folders.folders?.[0]?.id ?? 1;
  } catch {
    // default folder id 1
  }
  const { data } = await client.post('/contacts/lists', { name, folderId });
  return data.id;
}

export async function upsertBrevoContact(workspaceId, contact, listIds = []) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  const payload = {
    email: contact.email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: contact.firstName || '',
      LASTNAME: contact.lastName || '',
      COMPANY: contact.company || '',
      ...(contact.phone ? { SMS: contact.phone } : {}),
    },
    ...(listIds.length ? { listIds } : {}),
  };
  const { data } = await client.post('/contacts', payload);
  return data?.id;
}

export async function addContactsToBrevoList(workspaceId, brevoListId, emails) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  const chunks = [];
  for (let i = 0; i < emails.length; i += 150) chunks.push(emails.slice(i, i + 150));
  for (const chunk of chunks) {
    await client.post(`/contacts/lists/${brevoListId}/contacts/add`, { emails: chunk });
  }
}

export async function removeContactsFromBrevoList(workspaceId, brevoListId, emails) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  await client.post(`/contacts/lists/${brevoListId}/contacts/remove`, { emails });
}

/** Pushes a local list + its contacts to Brevo, creating the remote list if needed. */
export async function syncListToBrevo(workspaceId, listId) {
  const list = await ContactList.findOne({ _id: listId, workspaceId });
  if (!list) throw new Error('List not found');
  if (!list.brevoListId) {
    list.brevoListId = await createBrevoList(workspaceId, `EA - ${list.name}`);
    await list.save();
  }
  const contacts = await Contact.find({ workspaceId, lists: list._id, isDeleted: false, subscriptionStatus: 'subscribed' }).limit(5000);
  let synced = 0;
  for (const c of contacts) {
    try {
      const id = await upsertBrevoContact(workspaceId, c, [list.brevoListId]);
      if (id && !c.brevoContactId) {
        c.brevoContactId = String(id);
        await c.save();
      }
      synced += 1;
    } catch (err) {
      logger.warn(`Brevo sync skip ${c.email}: ${err.message}`);
    }
  }
  return { synced, total: contacts.length, brevoListId: list.brevoListId };
}

/** Transactional send via Brevo. Used for one-off transactional mail and campaign fan-out. */
export async function sendTransactionalEmail(workspaceId, { to, subject, htmlContent, textContent, replyTo, headers, tags }) {
  const { client, connection } = await getBrevoClientForWorkspace(workspaceId);
  const payload = {
    sender: { name: connection.defaultSenderName || 'Email Automation', email: connection.defaultSenderEmail },
    to: to.map((t) => ({ email: t.email, ...(t.name ? { name: t.name } : {}) })),
    subject,
    htmlContent: htmlContent || `<div>${textContent || ''}</div>`,
    ...(textContent ? { textContent } : {}),
    ...(replyTo || connection.replyToEmail ? { replyTo: { email: replyTo || connection.replyToEmail } } : {}),
    ...(headers ? { headers } : {}),
    ...(tags?.length ? { tags } : {}),
  };
  const { data } = await client.post('/smtp/email', payload);
  return { brevoMessageId: data.messageId };
}

/** Creates (and optionally schedules) a native Brevo email campaign. */
export async function createBrevoCampaign(workspaceId, { name, subject, htmlContent, listIds, scheduledAt, utmCampaign }) {
  const { client, connection } = await getBrevoClientForWorkspace(workspaceId);
  const { data } = await client.post('/emailCampaigns', {
    name,
    subject,
    sender: { name: connection.defaultSenderName || 'Email Automation', email: connection.defaultSenderEmail },
    type: 'classic',
    htmlContent,
    recipients: { listIds },
    ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
    inlineImageActivation: false,
  });
  return data.id;
}

export async function sendBrevoCampaignNow(workspaceId, brevoCampaignId) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  await client.post(`/emailCampaigns/${brevoCampaignId}/sendNow`);
}

export async function updateBrevoCampaignStatus(workspaceId, brevoCampaignId, status) {
  // status: suspended | archive | sent | queued | replicate
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  await client.put(`/emailCampaigns/${brevoCampaignId}/status`, { status });
}

export async function getBrevoCampaignReport(workspaceId, brevoCampaignId) {
  const { client } = await getBrevoClientForWorkspace(workspaceId);
  const { data } = await client.get(`/emailCampaigns/${brevoCampaignId}`, { params: { statistics: 'globalStats' } });
  const stats = data.statistics?.globalStats || {};
  return {
    status: data.status,
    sent: stats.sent || 0,
    delivered: stats.delivered || 0,
    uniqueViews: stats.uniqueViews || 0,
    uniqueClicks: stats.uniqueClicks || 0,
    softBounces: stats.softBounces || 0,
    hardBounces: stats.hardBounces || 0,
    unsubscriptions: stats.unsubscriptions || 0,
    complaints: stats.complaints || 0,
  };
}
