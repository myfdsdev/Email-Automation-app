import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { incrementUsage, assertWithinLimit } from './usageService.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

async function chat(messages, { json = false, maxTokens = 700 } = {}) {
  if (!env.openai.apiKey) return null;
  const { data } = await axios.post(
    OPENAI_URL,
    {
      model: env.openai.model,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
    { headers: { Authorization: `Bearer ${env.openai.apiKey}` }, timeout: 30000 }
  );
  return data.choices?.[0]?.message?.content ?? null;
}

/* ---------------- Reply classification ---------------- */

const HEURISTICS = [
  { re: /\b(unsubscribe|remove me|stop (emailing|contacting)|take me off|opt.?out)\b/i, classification: 'unsubscribe', sentiment: 'negative', intent: 'unsubscribe', unsub: true },
  { re: /\b(out of (the )?office|on vacation|annual leave|maternity|paternity|away until|auto.?reply|automatic reply|currently unavailable)\b/i, classification: 'out_of_office', sentiment: 'neutral', intent: 'auto_reply', ooo: true, auto: true },
  { re: /\b(no longer (works|with)|wrong (person|contact)|not the right person|left the company)\b/i, classification: 'wrong_contact', sentiment: 'neutral', intent: 'redirect' },
  { re: /\b(not interested|no thanks|no thank you|pass on this|we're (good|all set)|don't need)\b/i, classification: 'not_interested', sentiment: 'negative', intent: 'decline' },
  { re: /\b(price|pricing|cost|how much|quote|budget)\b/i, classification: 'pricing_question', sentiment: 'positive', intent: 'pricing_inquiry', human: true },
  { re: /\b(book|schedule|calendar|meeting|call (me|us)|demo|available (on|at)|let's (talk|chat|meet)|call tomorrow)\b/i, classification: 'meeting_request', sentiment: 'positive', intent: 'request_meeting', human: true },
  { re: /\b(interested|sounds (good|great|interesting)|tell me more|would love to|keen to)\b/i, classification: 'interested', sentiment: 'positive', intent: 'request_info', human: true },
  { re: /\b(more (info|information|details)|send (over|me) (details|more))\b/i, classification: 'more_information', sentiment: 'positive', intent: 'request_info', human: true },
  { re: /\b(complaint|report you|spam(ming)?|illegal|lawyer|gdpr)\b/i, classification: 'complaint', sentiment: 'negative', intent: 'complaint', human: true },
  { re: /\b(refer|forward(ed)? (this|you) to|speak (to|with) my colleague|cc'?ing)\b/i, classification: 'referral', sentiment: 'positive', intent: 'referral', human: true },
  { re: /\b(help|support|issue|problem with|not working|bug)\b/i, classification: 'support_request', sentiment: 'neutral', intent: 'support', human: true },
];

export function classifyReplyHeuristic(text) {
  const body = String(text || '').slice(0, 4000);
  for (const h of HEURISTICS) {
    if (h.re.test(body)) {
      return {
        classification: h.classification,
        sentiment: h.sentiment,
        intent: h.intent,
        requiresHumanReply: !!h.human,
        unsubscribeRequest: !!h.unsub,
        outOfOffice: !!h.ooo,
        summary: body.replace(/\s+/g, ' ').slice(0, 180),
        suggestedAction: h.classification === 'meeting_request' || h.classification === 'interested' ? 'send_booking_link' : h.unsub ? 'suppress_contact' : 'review_reply',
      };
    }
  }
  return {
    classification: 'unclassified',
    sentiment: 'neutral',
    intent: 'unknown',
    requiresHumanReply: true,
    unsubscribeRequest: false,
    outOfOffice: false,
    summary: body.replace(/\s+/g, ' ').slice(0, 180),
    suggestedAction: 'review_reply',
  };
}

export async function classifyReply(workspaceId, { subject, body, contactName }) {
  const heuristic = classifyReplyHeuristic(`${subject}\n${body}`);
  if (!env.openai.apiKey) return heuristic;

  try {
    await assertWithinLimit(workspaceId, 'ai_analyses');
    const content = await chat(
      [
        {
          role: 'system',
          content:
            'You classify sales email replies. Respond ONLY with JSON: {"classification": one of [interested, pricing_question, more_information, meeting_request, not_interested, unsubscribe, out_of_office, wrong_contact, referral, complaint, support_request, automatic_reply, spam], "sentiment": "positive"|"neutral"|"negative", "intent": short_snake_case, "requiresHumanReply": bool, "unsubscribeRequest": bool, "outOfOffice": bool, "summary": one sentence, "suggestedAction": one of [send_booking_link, send_pricing, send_information, suppress_contact, review_reply, schedule_call, update_contact]}',
        },
        { role: 'user', content: `From: ${contactName || 'contact'}\nSubject: ${subject || ''}\n\n${String(body || '').slice(0, 6000)}` },
      ],
      { json: true, maxTokens: 300 }
    );
    await incrementUsage(workspaceId, 'ai_analyses');
    const parsed = JSON.parse(content);
    // Never let the model un-flag an explicit unsubscribe caught by heuristics.
    if (heuristic.unsubscribeRequest) {
      parsed.unsubscribeRequest = true;
      parsed.classification = 'unsubscribe';
    }
    return { ...heuristic, ...parsed };
  } catch (err) {
    logger.warn(`AI classify failed, using heuristic: ${err.message}`);
    return heuristic;
  }
}

/* ---------------- Generation tools ---------------- */

const GEN_MODES = {
  email: 'Write a concise, personalized sales outreach email. Return JSON {"subject": "...", "body": "..."} where body is plain text with paragraphs.',
  subject: 'Generate 5 compelling email subject lines. Return JSON {"subjects": ["..."]}.',
  follow_up: 'Write a short, polite follow-up email referencing the earlier outreach. Return JSON {"subject": "...", "body": "..."}.',
  reply: 'Draft a helpful reply to the incoming email on behalf of the sender. Return JSON {"body": "..."}.',
  shorten: 'Shorten this email while keeping its meaning and call to action. Return JSON {"body": "..."}.',
  professional: 'Rewrite this email in a professional tone. Return JSON {"body": "..."}.',
  friendly: 'Rewrite this email in a warm, friendly tone. Return JSON {"body": "..."}.',
  grammar: 'Fix grammar and spelling without changing tone. Return JSON {"body": "..."}.',
  personalize: 'Rewrite the email to feel personally written for the recipient using the provided context. Keep {{variables}} intact. Return JSON {"body": "..."}.',
  summarize: 'Summarize this email thread in 2-3 sentences. Return JSON {"summary": "..."}.',
};

export async function generateContent(workspaceId, mode, { prompt, context }) {
  const instruction = GEN_MODES[mode];
  if (!instruction) throw new Error(`Unknown AI mode: ${mode}`);
  if (!env.openai.apiKey) {
    const e = new Error('AI is not configured. Add OPENAI_API_KEY on the server to enable AI features.');
    e.statusCode = 503;
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }
  await assertWithinLimit(workspaceId, 'ai_generations');
  const content = await chat(
    [
      { role: 'system', content: `You are an expert email copywriter for B2B sales. ${instruction} Do not include markdown fences.` },
      { role: 'user', content: `${prompt || ''}\n\nContext:\n${JSON.stringify(context || {}).slice(0, 4000)}` },
    ],
    { json: true, maxTokens: 800 }
  );
  await incrementUsage(workspaceId, 'ai_generations');
  return JSON.parse(content);
}
