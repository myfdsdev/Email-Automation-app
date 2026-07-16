import { Automation } from '../models/Automation.js';
import { AutomationExecution } from '../models/AutomationExecution.js';
import { Contact } from '../models/Contact.js';
import { FollowUp } from '../models/FollowUp.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

function resolveField(field, ctx) {
  const { contact, message, analysis } = ctx;
  const map = {
    status: contact?.status,
    tag: contact?.tags,
    tags: contact?.tags,
    source: contact?.source,
    list: contact?.lists?.map(String),
    lead_score: contact?.leadScore,
    open_count: contact?.openCount,
    click_count: contact?.clickCount,
    assigned_to: contact?.assignedTo ? String(contact.assignedTo) : null,
    consent_status: contact?.consentStatus,
    campaign: message?.campaignId ? String(message.campaignId) : null,
    sequence: message?.sequenceId ? String(message.sequenceId) : null,
    provider: message?.provider,
    reply_classification: analysis?.classification,
    sentiment: analysis?.sentiment,
  };
  return map[field];
}

function checkCondition(cond, ctx) {
  const actual = resolveField(cond.field, ctx);
  const expected = cond.value;
  const arr = Array.isArray(actual) ? actual : null;
  switch (cond.operator) {
    case 'equals': return arr ? arr.includes(expected) : String(actual) === String(expected);
    case 'not_equals': return arr ? !arr.includes(expected) : String(actual) !== String(expected);
    case 'contains': return String(arr ? arr.join(',') : actual || '').toLowerCase().includes(String(expected).toLowerCase());
    case 'in': return (Array.isArray(expected) ? expected : [expected]).some((v) => (arr ? arr.includes(v) : String(actual) === String(v)));
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    default: return false;
  }
}

async function executeAction(workspaceId, action, ctx) {
  const { contact } = ctx;
  const params = action.params || {};
  // Import lazily to avoid circular imports at module load
  const { sendTrackedEmail } = await import('./emailSendService.js');
  const { enrollContacts, stopEnrollment } = await import('./sequenceService.js');
  const { notify } = await import('./notificationService.js');
  const { createGmailDraft } = await import('../integrations/gmail/gmailService.js');
  const { EmailConnection } = await import('../models/EmailConnection.js');
  const { Workspace } = await import('../models/Workspace.js');

  switch (action.type) {
    case 'add_tag':
      if (contact && params.tag) await Contact.updateOne({ _id: contact._id }, { $addToSet: { tags: params.tag } });
      return;
    case 'remove_tag':
      if (contact && params.tag) await Contact.updateOne({ _id: contact._id }, { $pull: { tags: params.tag } });
      return;
    case 'update_contact_status':
      if (contact && params.status) await Contact.updateOne({ _id: contact._id }, { $set: { status: params.status } });
      return;
    case 'assign_member':
      if (contact && params.userId) await Contact.updateOne({ _id: contact._id }, { $set: { assignedTo: params.userId } });
      return;
    case 'start_sequence':
      if (contact && params.sequenceId) await enrollContacts(workspaceId, params.sequenceId, [contact._id], null);
      return;
    case 'stop_sequence':
      if (contact) await stopEnrollment(workspaceId, params.sequenceId || null, contact._id, 'manual');
      return;
    case 'create_follow_up':
      if (contact) {
        await FollowUp.create({
          workspaceId, contactId: contact._id,
          type: params.type || 'task',
          title: params.title || 'Follow up with contact',
          dueAt: new Date(Date.now() + (Number(params.delayDays ?? 1)) * 24 * 3600 * 1000),
          assignedTo: params.userId || contact.assignedTo,
          notes: params.notes,
        });
      }
      return;
    case 'schedule_ai_call':
      if (contact) {
        await FollowUp.create({
          workspaceId, contactId: contact._id, type: 'ai_call',
          title: params.title || 'AI call scheduled by automation',
          dueAt: params.at ? new Date(params.at) : new Date(Date.now() + 24 * 3600 * 1000),
          status: 'scheduled', notes: params.notes,
        });
      }
      return;
    case 'notify_team':
      await notify(workspaceId, {
        roles: params.roles || ['owner', 'admin'],
        type: 'team',
        title: params.title || 'Automation notification',
        body: params.body || (contact ? `Contact: ${contact.email}` : ''),
        link: contact ? `/contacts?open=${contact._id}` : undefined,
      });
      return;
    case 'send_webhook':
      if (params.url && /^https:\/\//.test(params.url)) {
        await axios.post(params.url, {
          event: ctx.trigger, contactEmail: contact?.email, contactId: contact?._id,
          workspaceId: String(workspaceId), at: new Date().toISOString(), data: params.payload || {},
        }, { timeout: 10000 });
      }
      return;
    case 'send_gmail_email':
    case 'send_brevo_email': {
      if (!contact) return;
      const provider = action.type === 'send_gmail_email' ? 'gmail' : 'brevo';
      const conn = params.connectionId
        ? await EmailConnection.findOne({ _id: params.connectionId, workspaceId })
        : await EmailConnection.findOne({ workspaceId, provider, status: 'connected' });
      if (!conn) throw new Error(`${provider} connection unavailable`);
      await sendTrackedEmail({
        workspaceId, contactId: contact._id, connectionId: conn._id, provider,
        subject: params.subject || 'Hello {{first_name | default: "there"}}',
        bodyHtml: params.bodyHtml || params.body || '',
        bodyText: params.bodyText || '',
        manualKey: `automation:${ctx.automationId}:${contact._id}:${ctx.trigger}:${new Date().toISOString().slice(0, 10)}`,
      });
      return;
    }
    case 'create_gmail_draft': {
      if (!contact) return;
      const conn = await EmailConnection.findOne({ workspaceId, provider: 'gmail', status: 'connected' });
      if (!conn) throw new Error('gmail connection unavailable');
      await createGmailDraft(conn._id, {
        to: [{ name: contact.fullName, email: contact.email }],
        subject: params.subject || '',
        bodyText: params.body || '',
        bodyHtml: params.bodyHtml || `<div>${params.body || ''}</div>`,
      });
      return;
    }
    case 'send_booking_link': {
      if (!contact) return;
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace?.bookingLink) throw new Error('No booking link configured in workspace settings');
      const conn = await EmailConnection.findOne({ workspaceId, provider: params.provider || 'gmail', status: 'connected' })
        || await EmailConnection.findOne({ workspaceId, status: 'connected' });
      if (!conn) throw new Error('No connected email account');
      await sendTrackedEmail({
        workspaceId, contactId: contact._id, connectionId: conn._id, provider: conn.provider,
        subject: params.subject || 'Book a time that works for you',
        bodyHtml: `<p>Hi {{first_name | default: "there"}},</p><p>You can pick a time that suits you here: <a href="${workspace.bookingLink}">${workspace.bookingLink}</a></p>`,
        manualKey: `booking:${contact._id}:${new Date().toISOString().slice(0, 10)}`,
      });
      return;
    }
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

/** Fire all active automations for a trigger. Fire-and-forget from callers. */
export async function runAutomations(workspaceId, trigger, ctx = {}) {
  const automations = await Automation.find({ workspaceId, trigger, status: 'active' });
  for (const automation of automations) {
    const execution = {
      workspaceId,
      automationId: automation._id,
      trigger,
      contactId: ctx.contact?._id,
      conditionsResult: { passed: true, checked: [] },
      actionsExecuted: [],
      status: 'success',
    };
    try {
      let passed = true;
      for (const cond of automation.conditions || []) {
        const condPassed = checkCondition(cond, { ...ctx, trigger });
        execution.conditionsResult.checked.push({
          field: cond.field, operator: cond.operator, expected: cond.value,
          actual: resolveField(cond.field, ctx), passed: condPassed,
        });
        if (!condPassed) passed = false;
      }
      execution.conditionsResult.passed = passed;

      if (!passed) {
        execution.status = 'skipped';
      } else {
        let failures = 0;
        for (const action of automation.actions || []) {
          try {
            await executeAction(workspaceId, action, { ...ctx, trigger, automationId: automation._id });
            execution.actionsExecuted.push({ type: action.type, status: 'success' });
          } catch (err) {
            failures += 1;
            execution.actionsExecuted.push({ type: action.type, status: 'failed', error: err.message?.slice(0, 300) });
          }
        }
        execution.status = failures === 0 ? 'success' : failures === automation.actions.length ? 'failed' : 'partial';
        automation.runCount += 1;
        automation.lastRunAt = new Date();
        await automation.save();
      }
    } catch (err) {
      execution.status = 'failed';
      execution.error = err.message?.slice(0, 300);
      logger.error(`Automation ${automation._id} failed: ${err.message}`);
    }
    await AutomationExecution.create(execution).catch((e) => logger.warn(`execution log failed: ${e.message}`));
  }
}
