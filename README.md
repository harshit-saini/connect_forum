# Connect: career guidance matching portal

A Next.js (App Router, TypeScript) PWA, deployed on Vercel, with no separate backend.

**Seekers** want career help; **Guides** are experienced people ready to give it. Both stay anonymous (no names, emails or phone numbers are shown) until a Guide approves a connection. An AI ranks Guides for each Seeker from the career profile each user fills in. The platform never relays messages: after approval the Seeker sees the Guide's phone number in the portal and contacts the Guide directly, outside the portal. Afterwards the Seeker rates the Guide, and ratings feed future matching.

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment guide](#deployment-guide): Neon, Resend, Azure AI Foundry, Vercel
- [Operations](#operations): jobs, cron, vault key rotation
- [Security and privacy model](#security-and-privacy-model)
- [Design decisions and deviations](#design-decisions-and-deviations)

---

## Quick start

Requirements: Node 22+, pnpm 10+, Postgres 16 with the [pgvector](https://github.com/pgvector/pgvector) extension.

```bash
pnpm install
cp .env.example .env     # MOCK_AI=true works with no external keys
# generate real secrets for .env:
#   AUTH_SECRET=$(openssl rand -base64 48)   CRON_SECRET=$(openssl rand -hex 24)
#   VAULT_ENCRYPTION_KEY=$(openssl rand -base64 32)
pnpm db:migrate          # creates the schema (and the `vector` extension)
pnpm seed                # fake Seekers and Guides with fake phone numbers
pnpm dev
```

With `MOCK_AI=true` the app runs fully offline: the LLM, the embeddings and e-mail are replaced by local mocks. **E-mails are written to the `dev_outbox` table** instead of being sent, so to sign in locally, read the code from there:

```bash
psql "$DATABASE_URL" -c "select \"to\", subject, left(text, 200) from dev_outbox order by created_at desc limit 3"
```

Seeded accounts (sign in with the e-mail; the one-time code lands in `dev_outbox`). The seed registers them through the real form logic, so the member-ID check applies: list `SEED-GUIDE-1…12` in `GUIDE_MEMBER_IDS` and `SEED-SEEKER-1…6` in `SEEKER_MEMBER_IDS` before running `pnpm seed` (and the `E2E-*` IDs from `playwright.config.ts` for `pnpm test:e2e`).

| Account | Role |
|---|---|
| `seed-seeker-1@example.com` … `seed-seeker-6@example.com` | Seeker (profile complete) |
| `seed-guide-1@example.com` … `seed-guide-12@example.com` | Guide (profile complete) |
| any address listed in `ADMIN_EMAILS` | Admin (no member ID needed) |

Local Postgres with pgvector, via Docker: `docker run -d -p 5432:5432 -e POSTGRES_USER=cf -e POSTGRES_PASSWORD=cf -e POSTGRES_DB=connect_forum pgvector/pgvector:pg16`.

Scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm db:generate` (after editing the schema), `pnpm db:migrate`, `pnpm seed`, `pnpm vault:rotate`.

---

## How it works

1. **Join through a link.** Seekers use `/join/seeker` (the link to host on the website, e.g. GACS.world); Guides get `/join/guide` by e-mail from *Admin → Invite Guides*. Both ask the visitor to sign in with e-mail (a 6-digit one-time code) and then show **one short page**.
2. **Member ID check (hard).** The form asks for the member ID. It must be on the role's allow-list: `GUIDE_MEMBER_IDS` for Guides, `SEEKER_MEMBER_IDS` for Seekers (case and spaces ignored; a Guide ID doesn't work for a Seeker). Each ID registers one account and can't be changed afterwards. With an empty list nobody can register. A Seeker form is category, question and years of experience; a Guide form is categories, role, a short "how can you help", years and a phone number (AES-256-GCM vault, never stored anywhere else). Pages other than Settings and sign-out stay gated until registration is complete.
   - **Categories (pilot):** Layoff / Unemployment, Career Stagnation, Upskilling / Training, Uncertainty (`src/config/taxonomy.ts`). A Seeker picks one; a Guide picks every one they can help with. A Guide is only matched to Seekers in their categories.
   - **FAQs first.** Before a Seeker's first search the dashboard shows the FAQs for their category (`src/config/faqs.ts`, also at `/faq`). *This answered my question* ends it there; *I still need a Guide* continues to matching. Outcomes are counted per category (no text stored) on the Admin home page.
3. **Find guides** (Seeker, on demand): hard filters in SQL (category, experience, blocks), a structured score (experience, focus), pgvector similarity, then an LLM rerank on *public fields only*, with a non-LLM fallback. Preliminary matches appear first and are upgraded in place; the Seeker is also e-mailed.
4. **Request**: the Seeker adds an optional note (screened for contact details). The Guide gets an e-mail with an anonymous summary and a **single-use link**, and approves or declines with a POST. No login needed.
5. **Reveal**: after approval the Seeker opens the connection and presses *Show number*. The server checks the unlock for that exact pair, decrypts, rate-limits, audits and returns the number with `Cache-Control: no-store`.
6. **Rating**: `RATING_DELAY_DAYS` after approval the Seeker is reminded to rate (1–5, optional private review). Guides see only an average and count, hidden until 3 ratings.

Admins (`ADMIN_EMAILS`) can list and suspend users, review reports, read ratings and reviews, and browse the audit log.

---

## Project layout

```
src/
  app/                   routes (App Router): (public) (setup) (app)/(gated) admin, api/*, review/[token]
  components/            ui/ (shadcn-style primitives), form/, join/ (the one-page form), faq/, profile/, matches/, safety/, pwa/
  config/                taxonomy.ts (all option lists), matching.ts (all weights/limits), safety.ts
  schemas/               zod schemas shared by browser and server (one seeker form, one guide form)
  lib/                   screening.ts (contact-detail screening), countries, display, utils
  server/                server-only code (`import "server-only"`)
    db/                  Drizzle client + schema (auth, core, profiles, jobs, matching)
    auth.ts              Better Auth (email OTP)
    vault/               AES-256-GCM, key versions, rotation, the single reveal-decrypt function
    jobs/                JobQueue interface, Postgres queue, worker, handlers, kick
    ai/                  LlmProvider + EmbeddingProvider: mock and Azure AI Foundry
    matching/            candidates (SQL filters), scoring, rerank, pipeline, public projections
    connections/         requests, token approval, reveal
    ratings/ safety/ admin/ account/ audit/ email/ ratelimit/ tokens/ profile/ logging/
  proxy.ts               per-request CSP nonce + optimistic auth redirect (Next 16 "proxy", formerly middleware)
public/                  sw.js (service worker), offline.html, icons/
drizzle/                 generated SQL migrations
scripts/                 migrate, seed, rotate-vault-key, generate-icons
tests/                   Vitest: unit + integration (real Postgres)
e2e/                     Playwright
```

---

## Environment variables

Validated with zod at server start (`src/server/env.ts`); a bad config fails fast with a readable list. `KEY=` (empty) counts as unset.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL. For Neon use the **pooled** URL. |
| `DIRECT_DATABASE_URL` | no | Non-pooled URL used for migrations (falls back to `DATABASE_URL`). |
| `APP_URL` | yes | Public origin, e.g. `https://connect.example.com`. Must be `https` in production. |
| `AUTH_SECRET` | yes | ≥ 32 random characters. Signs sessions and CSRF values. |
| `CRON_SECRET` | yes | ≥ 16 chars. Bearer token for `/api/cron/*` and `/api/jobs/process`. |
| `VAULT_ENCRYPTION_KEY` | yes | 32 random bytes, base64. Encrypts phone numbers. |
| `VAULT_KEY_VERSION` | no (1) | Version tag of the current vault key (see [rotation](#vault-key-rotation)). |
| `VAULT_PREVIOUS_KEYS` | no | Retired keys as `1:<base64>,2:<base64>`, needed until rotation finishes. |
| `ADMIN_EMAILS` | no | Comma-separated. Matched against the *verified* sign-in e-mail. |
| `GUIDE_MEMBER_IDS` / `SEEKER_MEMBER_IDS` | live | Allow-lists for the member-ID check, comma- or newline-separated. Required when `MOCK_AI=false`. |
| `FROM_EMAIL` | yes\* | Sender, e.g. `Connect <no-reply@mail.example.com>`. |
| `RESEND_API_KEY` | live | Resend API key. |
| `RESEND_WEBHOOK_SECRET` | live | Resend webhook signing secret (`whsec_…`). |
| `AI_ENABLED` | no (true) | Master switch. `false` removes the LLM rerank and the embeddings: Guides are matched from the profile answers alone (category, experience, focus, ratings) and none of the `FOUNDRY_*` / `EMBEDDING_*` settings are needed. |
| `AI_BRANDING` | no (follows `AI_ENABLED`) | Whether the UI describes matching as AI-driven ("AI match" badge, progress and landing copy). Presentation only; the consent checkbox always says what really happens. |
| `LLM_PROVIDER` | no (`anthropic`) | `anthropic` for a Claude deployment, `openai` for an OpenAI (GPT) deployment on Foundry. |
| `FOUNDRY_ENDPOINT` | live | Chat model resource URL, e.g. `https://<resource>.services.ai.azure.com`. |
| `FOUNDRY_API_KEY` | live | Chat model key. |
| `LLM_DEPLOYMENT` | live | Name of the chat deployment: a Claude Sonnet-tier model (Haiku tier is the cheaper fallback) or, with `LLM_PROVIDER=openai`, a GPT deployment. |
| `EMBEDDING_ENDPOINT` / `EMBEDDING_API_KEY` | live\* | Embedding model resource and key (may differ from the chat model). |
| `EMBEDDING_DEPLOYMENT` | no | Embedding deployment name (default `text-embedding-3-small`, 1536 dimensions). |
| `ENABLE_EMBEDDINGS` | no (true) | `false` skips vector retrieval; the top 20 by structured score are reranked instead. |
| `MOCK_AI` | no (false) | `true` mocks the LLM, embeddings and e-mail. **Refused on a Vercel production deploy.** |
| `RATING_DELAY_DAYS` | no (3) | Days after approval before the rating reminder. |
| `MAX_PENDING_REQUESTS` | no (3) | Pending requests a Seeker may have at once. |
| `MIN_GUIDE_EXPERIENCE_YEARS` | no (3) | Guides below this register but are not matched. |
| `MATCH_COOLDOWN_MINUTES` | no (60) | Minimum gap between a Seeker's searches. |
| `MATCH_MAX_RUNS_PER_DAY` | no (3) | Searches per Seeker per rolling 24 h. |
| `MATCH_MAX_CONCURRENCY` | no (5) | Global cap on simultaneously running match jobs. |
| `MAX_LLM_RUNS_PER_DAY` | no (200) | Global LLM budget; beyond it, runs still happen but rank without the LLM. |

\* "live" means required when `MOCK_AI=false`. Embedding keys are not needed when `ENABLE_EMBEDDINGS=false`.

---

## Upgrading an existing deployment to the pilot form

Migration `0007_pilot_simple_profile` is **additive**: it adds `member_id`, `category`/`categories` and the `faq_events` table and deletes nothing. Profiles created with the old long wizard have no member ID, so those members are treated as not registered: they are asked to register again on `/join/seeker` or `/join/guide` (their old answers stay in the database, unused) and are left out of matching until they do. Before deploying set `GUIDE_MEMBER_IDS` and `SEEKER_MEMBER_IDS`: with `MOCK_AI=false` the app refuses to start without them, so the check can never be left open by accident.

---

## Testing

```bash
pnpm typecheck && pnpm lint
pnpm test        # Vitest against a real Postgres+pgvector (TEST_DATABASE_URL, default: connect_forum_test)
pnpm test:e2e    # Playwright against a production build, with mock AI
```

- **Vitest** (≈160 tests): matching filters and scoring, rerank validation and prompt-injection containment, vault crypto and rotation, tokens and CSRF, validators and screening, the queue (concurrent claims, caps, backoff, stale recovery), connections, reveal, ratings, admin, export/delete, webhook signatures, and the service worker's routing.
- **Playwright**: the happy path (sign-in → register → FAQs → Find guides → request → approve → reveal → rate), plus registration for both roles (member-ID check, FAQs), the gate, admin, the PWA (real cache inspection and offline behaviour) and the Guide dashboard. Every e2e test fails on hydration errors and CSP violations. They need seeded data (`pnpm seed`) and a Postgres database (`DATABASE_URL`).
- In the sandbox this was built in, Playwright's bundled browser wasn't installable; set `CHROMIUM_PATH` to use another Chromium. CI installs it normally.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build, and a separate Playwright job, both with a `pgvector/pgvector:pg16` service.

---

## Deployment guide

### 1. Neon (database)

1. Create a project and a database. Region: close to your Vercel region.
2. Copy **both** connection strings: *pooled* (host contains `-pooler`) → `DATABASE_URL`; *direct* → `DIRECT_DATABASE_URL`.
3. **pgvector**: nothing to enable by hand. The first migration runs `CREATE EXTENSION IF NOT EXISTS vector` (supported on Neon). It adds the `vector(1536)` column and an HNSW index.
4. The app uses `@neondatabase/serverless` over WebSockets (transactions and `FOR UPDATE SKIP LOCKED` work on the pooled URL) and retries cold-start connection failures with backoff (connection establishment only; a statement that may have reached the server is never re-sent).
5. Migrations: `pnpm db:migrate` uses the direct URL, takes a Postgres advisory lock, applies only pending migrations, and is safe to run on every deploy. On Vercel it runs automatically for **production** deployments only (`pnpm vercel-build`); preview deployments never touch the database schema.

### 2. Resend (e-mail)

1. Add a **sending subdomain** (e.g. `mail.example.com`) under *Domains* and set `FROM_EMAIL="Connect <no-reply@mail.example.com>"`.
2. Add the DNS records Resend shows. Use its exact values; they have this shape:

   | Type | Name | Purpose |
   |---|---|---|
   | MX | `send.mail` | bounce/feedback handling |
   | TXT | `send.mail` | **SPF**: `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey.mail` | **DKIM**: public key (long `p=…` value) |
   | TXT | `_dmarc.mail` (or `_dmarc` for the root) | **DMARC**: start with `v=DMARC1; p=none; rua=mailto:dmarc@example.com`, move to `p=quarantine` once reports look clean |

3. Create an API key → `RESEND_API_KEY`.
4. **Webhook**: *Webhooks → Add endpoint* `https://<your-domain>/api/webhooks/resend`, events `email.delivered`, `email.bounced`, `email.complained` (others are acknowledged and ignored). Copy the signing secret (`whsec_…`) → `RESEND_WEBHOOK_SECRET`. Signatures (Svix scheme) are verified with a ±5 minute window; only the event type, message id and recipient *domain* are stored in `email_events`.

### 3. Azure AI Foundry (models)

Create **two deployments** in your Foundry resource:

1. **Chat model**: a Claude Sonnet-tier deployment (Haiku tier is the cheaper fallback). Set `LLM_DEPLOYMENT` to the *deployment name* and `FOUNDRY_ENDPOINT` to the resource URL (`https://<resource>.services.ai.azure.com`). The app calls the Anthropic Messages API at `{FOUNDRY_ENDPOINT}/anthropic/v1/messages` with `x-api-key` and `anthropic-version: 2023-06-01`, sending the fixed instructions as a cacheable system block.

   **Using an OpenAI model instead?** Deploy it in the same Foundry resource and set `LLM_PROVIDER=openai`, `LLM_DEPLOYMENT=<its deployment name>` (same `FOUNDRY_ENDPOINT` / `FOUNDRY_API_KEY`). The app then calls the OpenAI-compatible `{FOUNDRY_ENDPOINT}/openai/v1/chat/completions` with an `api-key` header and JSON mode. Nothing else changes: the prompt, validation, fallback and privacy rules are shared by both providers.
2. **Embedding model**: `text-embedding-3-small` (1536 dimensions; the DB column is fixed at 1536). Set `EMBEDDING_ENDPOINT`, `EMBEDDING_API_KEY`, `EMBEDDING_DEPLOYMENT`. The app calls the OpenAI-compatible route `{EMBEDDING_ENDPOINT}/openai/v1/embeddings` with an `api-key` header and `{ model: <deployment>, input, dimensions: 1536 }`.

> **Verify before go-live.** Microsoft's documentation host was not reachable from the environment this was built in, so the two request shapes above come from Anthropic's published Foundry guide plus the Azure OpenAI v1 conventions, and are unit-tested against a stub only. Both providers are small (`src/server/ai/llm.ts`, `src/server/ai/embeddings.ts`): if your resource expects a different path, header or API version, that is the only place to change. A quick check: set the `FOUNDRY_*` variables and run one search with `MOCK_AI=false`.

Both providers sit behind `LlmProvider` / `EmbeddingProvider` interfaces. Calls log model, token counts and latency, never profile content.

### 4. Vercel

1. Import the repo. Framework: Next.js. Package manager: pnpm. The build command comes from `vercel.json` (`pnpm vercel-build`).
2. **Environment variables**: add everything from the table above for *Production* (and *Preview* if you want previews: point them at a separate Neon branch, since previews skip migrations). Use `MOCK_AI=false`.
3. **Subdomain**: *Settings → Domains → Add* `connect.<yourdomain>`; add the CNAME it asks for. Set `APP_URL=https://connect.<yourdomain>`. Everything is same-origin, so there are no cross-site cookie issues.
4. **Cron**: `vercel.json` registers `/api/cron/housekeeping` once a day (03:17 UTC). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set. On the Hobby plan crons run at most daily, in UTC, with up to an hour of drift, in production only. **Nothing a user is waiting on depends on cron**: searches run through `after()` straight away, the status endpoint re-kicks a run that looks idle, and claiming recovers crashed jobs by itself.
5. **Function duration**: `/api/jobs/process` and the cron route are set to 60 s in `vercel.json` (the Hobby maximum; raise it on Pro).
6. Deploy. Check `GET /api/health`.

Pre-launch checklist: replace the placeholder Terms and Privacy pages; set `ADMIN_EMAILS`; confirm Resend shows the domain as *verified*; send yourself a sign-in e-mail; run one real search; trigger `GET /api/cron/housekeeping` manually with the bearer token.

---

## Operations

### Jobs

A Postgres `jobs` table behind a `JobQueue` interface (swap in QStash/Inngest by implementing it). Types: `embed_profile`, `match_run`, `send_email`, `rating_reminder`.

- Workers claim with `SELECT … FOR UPDATE SKIP LOCKED`; `match_run` concurrency is capped globally (`MATCH_MAX_CONCURRENCY`) under an advisory lock.
- Failures back off exponentially (30 s, 60 s, …) and become `dead` after the attempt limit. A dead `match_run` marks its run `failed`.
- A running job with no heartbeat for 5 minutes is requeued automatically at the next claim (and by housekeeping), so a function killed at its time limit never blocks the queue.
- Payloads carry ids only. The one exception is the single-use review token, which sits **vault-encrypted** in the `send_email` payload until the e-mail is sent, then is removed.

### Housekeeping (`GET /api/cron/housekeeping`)

Idempotent and safe to run late or twice. Requeues stalled jobs, fails runs whose job died, expires pending requests older than 7 days (and notifies the Seekers), runs whatever jobs are due (rating reminders), and purges old rate-limit rows, finished jobs and expired verification/session rows.

### Vault key rotation

Phone numbers are encrypted with `VAULT_ENCRYPTION_KEY` (AES-256-GCM, a fresh IV per value, the owner's id as authenticated data). Each row records the key version that sealed it.

1. Generate a new key: `openssl rand -base64 32`.
2. In the environment, set `VAULT_PREVIOUS_KEYS="<oldVersion>:<oldKeyBase64>"`, then `VAULT_ENCRYPTION_KEY=<new key>` and `VAULT_KEY_VERSION=<oldVersion + 1>`. Deploy. New numbers use the new key; old rows still decrypt via the retired key.
3. Re-encrypt existing rows: `pnpm vault:rotate` (run with the production env, e.g. `vercel env pull .env.production.local && dotenv -e .env.production.local -- pnpm vault:rotate`). It is idempotent and resumable.
4. When it reports `rotated 0 vault row(s)`, remove the retired key from `VAULT_PREVIOUS_KEYS` and redeploy.

Losing a key makes the numbers encrypted with it unrecoverable (Guides would need to re-enter them). Keep backups of keys in your secret manager.

### Tuning

All matching weights and limits are in `src/config/matching.ts`; all option lists in `src/config/taxonomy.ts`. Stored values are stable ids, so labels can change freely (renaming a *value* needs a data migration). Changing the embedding document layout? Bump `DOC_TEMPLATE_VERSION` in `src/server/matching/documents.ts`; the version is stored with every vector.

---

## Security and privacy model

- **Anonymity**: users see each other only by role/category and experience; there are no aliases. No API returns another user's e-mail, real name, LinkedIn, private fields, exclusion list or phone, except the phone through the reveal endpoint. Matching never uses gender, age, religion, caste, marital status, photo or real name (none is collected).
- **Phone numbers**: encrypted at rest in their own table; never in drafts, logs, e-mails, AI prompts, audit rows or cached responses (tests assert each). The service worker cannot cache them: it never intercepts API, auth, review or personal pages.
- **AI**: only an explicit public projection of each profile is sent to the model, as JSON inside delimited data blocks, with instructions to ignore any instructions inside them. Output is schema-validated, retried once, then replaced by the non-LLM ranking. Free text is screened for contact details on input.
- **Tokens**: 256-bit random, only the SHA-256 hash is stored, single-use, 7-day expiry. Opening the link is read-only; approving is a POST with a signed CSRF value bound to the token, under a row lock.
- **Web**: HTTP-only `SameSite=Lax` session cookies (`Secure` in production), nonce-based CSP, HSTS, `frame-ancestors 'none'`, origin checks on state-changing route handlers, Next's built-in Origin check on server actions.
- **Abuse limits**: Postgres-backed fixed-window rate limits on auth, review links, match start, requests, reveal, report/block, ratings and export; plus per-Seeker cooldown, daily cap and a global LLM budget.
- **Accountability**: an audit log of requests, approvals, unlocks, reveals (and denied reveals), suspensions, reports and exports. Structured logs are redacted.
- **Your data**: Settings has JSON export and account deletion. Deletion hard-deletes the vault entry and embeddings explicitly, then everything else by cascade; the audit log keeps an anonymous record.

---

## Design decisions and deviations

Things worth knowing, where the build had to choose or differ from the brief's letter:

- **Auth**: Better Auth with e-mail OTP. The sign-in e-mail contains the code *and* a link that pre-fills it (the code travels in the URL fragment, which servers never see, and opening the link changes nothing, so mail scanners can't use it). The code works in an installed iOS PWA, where a plain magic link would open in Safari instead.
- **Next.js 16**: `middleware` is now `proxy.ts`. It only does the optimistic redirect and the CSP nonce; the real onboarding gate and authorization read the database in server layouts and guards.
- **Service worker**: hand-written rather than Serwist. Serwist's Next integration hooks webpack, while this project builds with Turbopack. The worker is ~60 lines, unit-tested, and caches only static assets and the offline page.
- **"Multi-select, rank top 3"** is modelled as an ordered list: position is the rank and the first three are weighted most.
- **Exclusion lists** hold employers/competitors. Two users sharing an excluded company are not matched, since that means a shared employer (the "either direction" check).
- **Cached results hash**: besides profile version, guide-pool version and ratings, it includes the Seeker's own request activity, because pending and approved requests change who is eligible.
- **LLM budget**: when `MAX_LLM_RUNS_PER_DAY` is spent, searches still run and rank without the LLM (marked in the UI) rather than being refused.
- **Ratings** are allowed once a request is approved (not gated on the reminder), editable for 7 days.
- **Not built** (see `SUGGESTIONS.md`): unblock, cancelling a pending request, reporter notifications, push notifications (out of scope for v1).
