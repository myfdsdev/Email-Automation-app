# Email Automation

A production-ready MERN SaaS for sales and marketing email automation. Connect **Gmail** (1:1 outreach, inbox sync, reply detection) and **Brevo** (bulk campaigns, transactional email, tracking webhooks), manage a lightweight CRM, launch personalized campaigns and multi-step follow-up sequences, classify replies with AI, and manage everything from a unified dashboard.

```text
User Signup → Create Workspace → Connect Gmail → Connect Brevo → Import Contacts
→ Create Lists → Build Templates → Launch Campaign or Sequence → Send via Workers
→ Track Delivery / Open / Click / Reply → Classify Intent → Stop Follow-ups
→ Update CRM → Book Appointment → View Analytics
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn-style UI on Radix primitives, TanStack Query, React Hook Form + Zod, Zustand, Recharts, TipTap, Axios, Lucide |
| Backend | Node.js, Express 4, MongoDB + Mongoose, JWT (HTTP-only cookies), bcrypt, Zod, Helmet, CORS allowlist, rate limiting, mongo-sanitize, Multer, Nodemailer |
| Background | Redis + BullMQ, dedicated worker process (`worker/worker.js`), inline dev fallback when Redis is absent |
| Integrations | Gmail API (OAuth 2.0 + Pub/Sub push), Brevo v3 API + webhooks, OpenAI-compatible AI (optional), Stripe-ready billing |

## Repository layout

```text
email-automation/
├── client/                 # React app (Vite)
│   └── src/{api,components,features,layouts,pages,stores,lib}
├── server/                 # Express API
│   ├── config/             # env, mongo, redis
│   ├── controllers/        # route handlers
│   ├── middleware/         # auth, workspace/RBAC, validation, errors, rate limits, uploads
│   ├── models/             # 26 Mongoose models (all workspace-scoped)
│   ├── routes/             # /api/* route table
│   ├── services/           # business logic (send pipeline, sequences, automations, AI, …)
│   ├── integrations/       # gmail/ (OAuth, MIME, sync, watch) and brevo/ (client, campaigns)
│   ├── queues/             # BullMQ queue registry + inline dev fallback
│   ├── workers/            # job processors + worker bootstrap
│   ├── validators/         # Zod schemas
│   └── server.js
├── worker/worker.js        # dedicated background worker entry (RUN_WORKERS=true)
├── .env.example
└── README.md
```

---

## Local setup

### Prerequisites

- Node.js ≥ 20
- MongoDB ≥ 6 (or use the built-in in-memory dev database — see below)
- Redis ≥ 6 (required for production workers; optional in development)

### 1. Install

```bash
git clone <repo>
cd email-automation
npm install                      # root (concurrently)
npm install --prefix server
npm install --prefix client
```

### 2. Environment variables

```bash
cp .env.example server/.env
```

Generate the required secrets:

```bash
node -e "console.log('JWT_ACCESS_SECRET='  + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('COOKIE_SECRET='      + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('EMAIL_CREDENTIAL_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

`EMAIL_CREDENTIAL_ENCRYPTION_KEY` (32-byte hex) encrypts Gmail tokens and Brevo API keys with AES-256-GCM before they touch the database. All four are **mandatory in production** — the server refuses to boot without them.

### 3. MongoDB

Point `MONGODB_URI` at your instance:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/email-automation
```

**No MongoDB installed?** For local evaluation set `USE_MEMORY_DB=true` — the server starts an in-memory MongoDB (data is lost on restart). Never use this in production.

### 4. Redis

```env
REDIS_URL=redis://127.0.0.1:6379
```

- **With Redis**: scheduled sends, sequences, Gmail sync, watch renewal, webhook processing and retries all run through BullMQ in the worker process.
- **Without Redis (dev only)**: leave `REDIS_URL` empty. The web process runs an *inline* queue and lightweight schedulers so every flow still works while developing. The dedicated worker refuses to start without Redis.

### 5. Run

```bash
# everything at once (API + client + worker)
npm run dev

# or individually
npm run dev:server    # http://localhost:5000
npm run dev:client    # http://localhost:5173  (proxies /api to :5000)
npm run dev:worker    # requires REDIS_URL
```

Sign up at `http://localhost:5173/signup` — the first user gets a workspace with the `owner` role automatically.

---

## Google Cloud — Gmail OAuth setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library** → enable **Gmail API**.
3. **OAuth consent screen**: External, add scopes `gmail.readonly`, `gmail.send`, `gmail.compose`, `gmail.modify`, `userinfo.email`, `userinfo.profile`. Add your Google account as a test user while in testing mode.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized redirect URI: `http://localhost:5000/api/integrations/gmail/callback` (and your production URL later).
5. Copy into `server/.env`:

```env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=http://localhost:5000/api/integrations/gmail/callback
```

Tokens are encrypted at rest; refresh tokens are never sent to the frontend. Expired/revoked tokens flip the connection to `expired` and the UI offers one-click reconnect.

### Google Pub/Sub (Gmail push notifications)

Without Pub/Sub the app falls back to periodic incremental sync (every 5 min via the worker). For real-time reply detection:

1. **Pub/Sub → Create topic**, e.g. `projects/YOUR_PROJECT/topics/gmail-events`.
2. Grant publish rights to Gmail: add principal `gmail-api-push@system.gserviceaccount.com` with role **Pub/Sub Publisher** on the topic.
3. Create a **push subscription** pointing to `https://YOUR_API_DOMAIN/api/webhooks/gmail` (must be HTTPS in production; use ngrok locally).
4. Set:

```env
GOOGLE_PUBSUB_TOPIC=projects/YOUR_PROJECT/topics/gmail-events
GOOGLE_PUBSUB_SUBSCRIPTION=projects/YOUR_PROJECT/subscriptions/gmail-events-push
```

The `gmail-watch` worker renews each mailbox watch every 6 hours (watches expire after 7 days). Failed renewals mark the connection `unhealthy` and notify workspace admins.

## Brevo setup

1. Create a [Brevo](https://www.brevo.com) account and verify a **sender** (Settings → Senders & IPs).
2. Create an API key: **Settings → SMTP & API → API Keys**.
3. In the app: **Integrations → Connect Brevo**, paste the key + default sender. The key is validated against `/v3/account` and stored encrypted.

### Brevo webhooks

In Brevo → **Webhooks** (both Transactional and Marketing), add:

```text
POST https://YOUR_API_DOMAIN/api/webhooks/brevo?workspace=<your-workspace-id>
```

(The exact URL with your workspace id is shown on the Integrations page.) Select all events: sent, delivered, opened, clicked, soft/hard bounce, blocked, spam, unsubscribed, error.

Webhook processing is **idempotent** (unique event ids + event-level dedupe keys), queued through BullMQ with 5 retries, and raw payloads are stored on `WebhookEvent` for debugging. Hard bounces, spam complaints and unsubscribes automatically suppress the contact, stop their sequences and cancel scheduled sends.

## Optional providers

```env
OPENAI_API_KEY=sk-...        # AI generation + reply classification (heuristic fallback without it)
STRIPE_SECRET_KEY=sk_...     # billing (plan changes work without Stripe in self-hosted mode)
SMTP_HOST=...                # system mail (verification/reset). Logged to console in dev if unset.
```

---

## Architecture notes

### Multi-tenancy & roles

Every domain model carries `workspaceId`; the `requireWorkspace` middleware resolves the `X-Workspace-Id` header, verifies active membership and every query filters by it. Roles: **Owner** (billing, integrations, team, everything), **Admin** (contacts/templates/campaigns/sequences/automations/analytics), **Sales** (assigned contacts & conversations, replies, follow-ups), **Viewer** (read-only analytics).

### The send pipeline (`services/emailSendService.js`)

Every automated outbound email passes one gate that enforces, in order:

1. suppression list → 2. contact status → 3. **idempotency key** (`workspaceId:contactId:campaignId|sequenceId:stepId`, unique index) → 4. provider connection health → 5. plan usage limits → 6. sending window / skip-weekends → 7. per-connection daily & hourly limits → 8. already-replied check → 9. provider send → 10. record message + event + usage.

Worker retries can never double-send: the idempotency key is reserved in MongoDB with a unique index before any provider call.

### Sequences

Step-based (subject, body, delay, per-step skip conditions). Follow-ups reply inside the original Gmail thread (`In-Reply-To`/`References` + `Re:` subject). Enrollments automatically stop on reply, unsubscribe, hard bounce, spam complaint, meeting booked, conversion or manual stop. The sequence worker scans due enrollments every minute.

### Reply intelligence

Gmail push/poll sync ingests new messages → inbound messages on known threads are matched to campaigns/sequences → **sequences stop first** → AI (or regex heuristics without an API key) classifies into 13 intents → unsubscribe requests suppress the contact **before any other action** → contact status/lead score update → notifications + automations fire → optionally an AI-suggested reply is saved as a **Gmail draft for human review** (auto-send is off by default and gated by a workspace setting).

### Web vs worker

```env
# web service
RUN_WORKERS=false
# worker service
RUN_WORKERS=true
```

The web process never runs heavy jobs when Redis is configured. Repeatable jobs: sequence tick (1 min), Gmail sync-all (5–15 min), watch renewal (6 h), Brevo campaign report refresh (10 min).

## API surface

`/api/auth` `/api/users` `/api/workspaces` `/api/team` `/api/integrations/gmail` `/api/integrations/brevo` `/api/contacts` (+`/import`) `/api/contact-lists` `/api/segments` `/api/templates` `/api/campaigns` `/api/sequences` `/api/automations` `/api/inbox` `/api/email-messages` `/api/appointments` `/api/follow-ups` `/api/suppression` `/api/notifications` `/api/ai` `/api/search` `/api/analytics` `/api/billing` `/api/admin` `/api/webhooks/{brevo,gmail,calling}`

All responses use `{ success, message, data }`; errors add `code` and `details`. Auth uses a 15-minute access token + 30-day rotating refresh token, both HTTP-only cookies (`SameSite=Lax` + `Secure` in production; set `COOKIE_SAMESITE=none` for split-domain deploys).

### Calling-app integration

Ready-made endpoints for an AI voice agent: automations can `schedule_ai_call` (creates a `FollowUp` of type `ai_call`), and the calling app posts outcomes to `POST /api/webhooks/calling/outcome` — which records the result, updates contact status, fires the `ai_call_completed` trigger and optionally sends a follow-up email.

## Admin panel

Sign in as a platform admin (set `isPlatformAdmin: true` on your user document) and open `/admin`: users, workspaces, connections, contacts, campaigns, sequences, automations, email logs, webhook events (with retry), queue jobs, suppression, usage, plans, payments, audit logs and system health.

```js
// one-time bootstrap in mongosh
db.users.updateOne({ email: 'you@company.com' }, { $set: { isPlatformAdmin: true } })
```

---

## Production deployment

**→ Full step-by-step guide: [DEPLOYMENT.md](DEPLOYMENT.md)**

This repo ships a Render Blueprint ([`render.yaml`](render.yaml)): push to GitHub, then Render → **New** → **Blueprint**. It provisions a web service (API + SPA on one origin) and a background worker, sharing secrets through an env group so both agree on the JWT and credential-encryption keys. MongoDB (Atlas) and Redis (Upstash/Redis Cloud) are managed externally — you supply `MONGODB_URI` and a `rediss://` `REDIS_URL`.

The essentials, if you are deploying somewhere else:

1. **Build client**: `npm run build --prefix client`. The API serves `client/dist` automatically when `NODE_ENV=production` (disable with `SERVE_CLIENT=false` if a CDN serves it).
2. **Web service**: `NODE_ENV=production RUN_WORKERS=false npm start`
3. **Worker service**: `NODE_ENV=production RUN_WORKERS=true npm run start:worker`
4. **Build indexes before taking traffic**: `npm run db:indexes`. `autoIndex` is off in production, and unique indexes are what enforce duplicate-send prevention and per-workspace contact uniqueness.
5. Set `CLIENT_URL`/`API_URL` to your HTTPS domain (CORS + email links depend on them) and update the Google redirect URI and Brevo webhook URL. On Render these derive from `RENDER_EXTERNAL_URL` automatically.
6. Cookies are `Secure` + `SameSite=Lax` in production, which works same-origin and keeps the Gmail OAuth return redirect intact. Split-domain deploys need `COOKIE_SAMESITE=none` plus `VITE_API_URL` at build time.
7. Scale workers horizontally as sending volume grows — idempotency keys make this safe. Note the web service's rate limiter is in-memory, so scale that out only after moving it to a Redis store.

The server validates its own production config at boot and refuses to start on a missing/malformed encryption key, a missing `REDIS_URL`, a localhost `CLIENT_URL`, or default dev secrets.

### Security checklist (implemented)

HTTP-only + Secure cookies, refresh-token rotation with revocation, CSRF-safe OAuth `state` (signed JWT bound to user + workspace), AES-256-GCM encryption for Gmail tokens & Brevo keys, bcrypt(12), per-route rate limits, Zod validation everywhere, mongo-sanitize, Helmet, workspace ownership checks on every query, audit logs, webhook validation + idempotency, upload type/size limits, and log redaction (tokens/keys/passwords never logged).

## Verified in this build

- Signup/login/refresh/logout, email verification + password reset flows
- Workspace isolation (cross-workspace access returns `NOT_A_MEMBER`)
- Contact CRUD, CSV/Excel import wizard (detect → map → validate → duplicates → suppression → confirm → report), export, bulk actions
- Lists, dynamic segments with live count preview
- Template editor (rich/plain/HTML) with variables, fallbacks, preview and test send
- Campaign wizard (details → audience → content → schedule → review) with exclusion accounting, missing-variable warnings and sending-time estimate; pause/resume/cancel/duplicate
- Sequences: steps with delays, enrollment (list + individual), duplicate-enrollment prevention, stop-on-reply/suppression/meeting-booked
- Automations: trigger → conditions → actions with execution log
- Suppression: instantly stops enrollments and cancels scheduled sends
- Appointments: booking stops sequences and sets `meeting_booked`
- Billing: usage meters and plan changes with limit enforcement (`USAGE_LIMIT_REACHED`)
- Responsive layout (mobile drawer nav), dark mode, empty/loading/error states throughout
