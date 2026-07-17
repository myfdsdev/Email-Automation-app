# Deploying to Render

This repo ships a Render Blueprint ([`render.yaml`](render.yaml)) that provisions two services:

| Service | Type | Runs | Why separate |
| --- | --- | --- | --- |
| `email-automation-web` | web | Express API **and** the built React SPA on one origin | Same-origin means no CORS and no cross-site cookie rules |
| `email-automation-worker` | worker | BullMQ processors: sending, sequences, Gmail sync, webhooks | Heavy jobs must never run in the request path |

MongoDB and Redis are **managed and external** — they are not part of the blueprint.

---

## 1. Provision the datastores first

You need connection strings before the first deploy.

**MongoDB Atlas**
1. Create a free M0 cluster.
2. Database Access → add a user with **Read and write to any database**.
3. Network Access → allow `0.0.0.0/0` (Render egress IPs are dynamic on the Starter plan; use a dedicated egress IP + allowlist if you need to lock this down).
4. Copy the `mongodb+srv://...` string and append a database name: `.../email-automation?retryWrites=true&w=majority`.

**Redis (Upstash or Redis Cloud)**
1. Create a database in the **same region** you deploy to — cross-region Redis adds latency to every job.
2. Copy the **TLS** URL. It must start with `rediss://` (two `s`).
3. Upstash free tier has a command limit; sustained sending will exceed it. Budget for a paid tier under real load.

> BullMQ holds long-lived connections and uses blocking commands. Do not point `REDIS_URL` at a Redis that evicts keys under memory pressure (`maxmemory-policy` must be `noeviction`), or queued jobs can disappear silently.

## 2. Generate the encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This is `EMAIL_CREDENTIAL_ENCRYPTION_KEY`, and it must be **exactly 64 hex characters** — the server refuses to boot in production otherwise, rather than silently falling back to a derived key.

**Store it in a password manager before you continue.** It encrypts every Gmail refresh token and Brevo API key at rest. If you lose it, that data is unrecoverable and every user must reconnect their integrations. The web and worker services must use the *same* value, which is why the blueprint puts it in a shared env group.

## 3. Deploy the blueprint

1. Push this repo to GitHub.
2. Render Dashboard → **New** → **Blueprint** → select the repo.
3. Render reads `render.yaml` and prompts for every `sync: false` variable:

   | Variable | Value |
   | --- | --- |
   | `EMAIL_CREDENTIAL_ENCRYPTION_KEY` | the 64-hex key from step 2 |
   | `MONGODB_URI` | Atlas connection string |
   | `REDIS_URL` | `rediss://...` |
   | `CLIENT_URL` *(worker only)* | your web service URL, e.g. `https://email-automation-web.onrender.com` |

   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and `COOKIE_SECRET` are generated once by Render and shared across both services — leave them alone.

   Integration keys (`GOOGLE_*`, `BREVO_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `STRIPE_*`, `SMTP_*`) are optional. Leave any blank to run without that feature.

4. Apply. First build takes ~3–5 minutes (it installs both packages and builds the SPA).

The web service derives `CLIENT_URL`, `API_URL` and `GOOGLE_REDIRECT_URI` from `RENDER_EXTERNAL_URL`, which Render injects automatically — you only set those by hand for a custom domain. The **worker** has no external URL of its own, so its `CLIENT_URL` must be set explicitly or links inside outbound emails will point nowhere.

## 4. Google OAuth (Gmail)

Only needed if you want Gmail features.

1. Google Cloud console → APIs & Services → **Enable** the Gmail API.
2. OAuth consent screen → External. While in *Testing*, only listed test users can connect, and refresh tokens expire after 7 days — **publish the app** before real use.
3. Credentials → OAuth client ID → Web application:
   - **Authorized JavaScript origins**: `https://<your-web-url>`
   - **Authorized redirect URIs**: `https://<your-web-url>/api/integrations/gmail/callback`

   This must match byte for byte, including the scheme and no trailing slash.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the shared env group.

The server boots-checks this: if `GOOGLE_CLIENT_ID` is set but the redirect URI still points at localhost, it fails fast rather than breaking at the end of the consent flow.

### Gmail push (optional but recommended)
Without Pub/Sub, inbox sync falls back to periodic polling — replies are detected on a delay.

1. Create a Pub/Sub topic, then grant `gmail-api-push@system.gserviceaccount.com` the **Pub/Sub Publisher** role on it.
2. Create a **push** subscription to `https://<your-web-url>/api/webhooks/gmail`.
3. Set `GOOGLE_PUBSUB_TOPIC` and `GOOGLE_PUBSUB_SUBSCRIPTION`.

Gmail watches expire after 7 days; the worker renews them automatically.

## 5. Brevo

Brevo API keys are per-workspace and entered in the app UI (Integrations → Brevo), not via env.

For webhooks: Brevo dashboard → set the webhook URL to `https://<your-web-url>/api/webhooks/brevo` and enable the delivery/open/click/bounce/spam/unsubscribe events. Set `BREVO_WEBHOOK_SECRET` to match. If the secret is unset the endpoint still accepts events (and logs that it is unverified) — set it in production.

## 6. Verify the deploy

```bash
curl https://<your-web-url>/health
# {"status":"ok","uptime":...}
```

Then check, in order:
- The web service log shows `Serving client build from ...` — if instead it logs `SERVE_CLIENT is on but no client build found`, the client build step failed; check the build log.
- The **worker** log shows `Background worker process running.` A worker that exits immediately almost always means `REDIS_URL` is missing or not `rediss://`.
- Sign up in the UI. If signup succeeds but you are bounced back to login, the session cookie was rejected — confirm you are on HTTPS and `COOKIE_SAMESITE` is `lax` (not `strict`).
- Send a test campaign to yourself and confirm the worker log shows the job running. If the API queues but nothing sends, the worker cannot reach Redis.

---

## Notes and known limits

**Free tier will not work for this app.** Render's free web services sleep after inactivity and free plans have no background workers. Scheduled sends and sequences need an always-on worker; Starter (or above) on both services is the minimum.

**Rate limiting is per-instance.** `express-rate-limit` uses an in-memory store, so scaling the web service past one instance multiplies the effective limits. Move it to a Redis store before scaling out.

**The client bundle is ~1.6 MB (~470 KB gzipped)** in one chunk. It works, but first load is heavier than it should be — route-level code splitting is the obvious follow-up.

**Migrations.** Mongoose builds indexes automatically only when `autoIndex` is on, and it is **disabled in production** (see `server/config/db.js`). Indexes created by a fresh deploy against an empty Atlas database will not exist. Either run one deploy with `autoIndex` enabled, or create indexes manually via `Model.syncIndexes()` before serious traffic.

### Custom domain
Add the domain in Render, then override in the web service:
- `CLIENT_URL` and `API_URL` → `https://your-domain.com`
- `GOOGLE_REDIRECT_URI` → `https://your-domain.com/api/integrations/gmail/callback` (and re-register it in Google Cloud)
- worker `CLIENT_URL` → `https://your-domain.com`

### Splitting the frontend onto a CDN later
Set `SERVE_CLIENT=false` on the web service, build the client with `VITE_API_URL=https://<api-domain>`, and set `COOKIE_SAMESITE=none` on the API — browsers reject cross-site cookies otherwise. Add the frontend origin to `CLIENT_URL` so CORS admits it.
