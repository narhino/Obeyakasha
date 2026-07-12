# Decisions log (append-only)

Deviations from / refinements to `docs/PLAN.md` made during the build. Newest last.

---

## 2026-07-11 — M0 build

- **Sessions: JWT strategy (not DB sessions).** PLAN §6.1 said "JWT-in-encrypted
  cookie"; implemented with Auth.js `session.strategy = "jwt"`. The `sessions`
  table exists (adapter contract) but is unused while on JWT. Role + uid +
  patreonId are carried in the token; middleware reads them with no DB hit,
  which is what keeps edge middleware DB-free.
- **Split auth config.** `src/auth.config.ts` (edge-safe: providers + authorized
  + jwt/session callbacks, no DB) vs `src/auth.ts` (Node: adapter + Patreon sync
  events). Middleware imports only the former. This is the documented Auth.js v5
  pattern and prevents the DB client from being bundled into edge middleware.
- **Goddess pin timing.** Role is pinned two ways that agree: immediately in the
  JWT callback when `account.providerAccountId === ADMIN_PATREON_USER_ID`, and
  durably in the DB via `pinGoddessRole()` in the `events.signIn` handler.
- **Patreon campaign/tier discovery via settings.** Creator sign-in caches the
  campaign id + tier list into `settings` (`patreon_campaign_id`,
  `patreon_campaign_tiers`) using new untyped `getRawSetting/setRawSetting`
  accessors. The Sanctum Access page reads these to list real tiers to map. The
  fixed `SETTINGS_DEFAULTS` contract stays typed; dynamic keys use the raw API.
- **Transcriber shipped as a stub.** `src/transcriber/main.py` boots with
  `TRANSCRIBER_STUB=1` and returns empty transcripts so the container builds and
  the contract is fixed now, without pulling multi-GB whisper weights. Real
  faster-whisper is enabled in M3 (`TRANSCRIBER_STUB=0` + uncomment requirement).
- **Full data model built in M0.** All ~53 domain tables from PLAN §5 exist in
  one baseline migration (`drizzle/0000_init.sql`), even though most features
  land later. Later milestones add columns/tables incrementally; this keeps the
  baseline coherent.
- **Worker is a heartbeat stub.** `src/workers/index.ts` stays alive under
  compose; pg-boss job consumers are registered per-feature starting M1.
- **Local dev auth.** Full browser sign-in needs real Patreon OAuth credentials
  (not available in the build env). The Patreon sync + entitlement path is
  instead verified by an integration test (`src/lib/patreon/sync.test.ts`)
  against the test DB with a mocked Patreon API — covering the M0 DoD
  (tiers discovered, link + entitlement written, access resolved, audit logged).

## 2026-07-11 — M1 build (media core)

- **Pluggable MediaProvider.** `src/lib/media` selects Local (dev/test, files
  under `MEDIA_LOCAL_DIR`) or Bunny (prod, `BUNNY_STORAGE_ZONE` set) — same
  interface. Stream URLs are short-lived HMAC-signed; the local `/api/stream`
  route serves bytes with HTTP Range (206) support, the Bunny path signs a CDN
  token URL the client fetches directly. Byte-serving + Range + token rejection
  verified end-to-end (`src/app/api/stream/route.test.ts`).
- **ffmpeg-optional ingest.** No transcode in dev: the uploaded bytes ARE the
  stream source, stored under the real extension (never forcing `.m4a` onto
  mp3/wav). ffprobe reads duration when present; otherwise the client-measured
  duration (or admin edit) fills it. The prod worker container installs ffmpeg
  for the AAC/normalize/waveform steps (PLAN §7.2) — wired when that container
  runs; not exercised in this env.
- **Uploads via server actions** with `serverActions.bodySizeLimit = 512mb`.
  Chunked/tus upload for very large masters remains a later hardening.
- **Program completion derived from listen sessions.** Rather than a separate
  write path, a program item counts as completed when the subject has a
  completed `listen_sessions` row for that track; gating (`computeGates`,
  pure + tested) consumes those completion timestamps. Daily gating uses the
  "24h after previous completion" rule.
- **Player is a single audio engine** (`PlayerRoot`) mounted once in the
  subject route group, reconciling a Zustand store with one `<audio>` element:
  signed-URL loading, play/pause, 10s heartbeats, end handling, Media Session,
  sleep timer, grounding. Store logic (queue/nav/end-modes/grounding) is
  unit-tested headlessly; the DOM/audio binding is exercised in the browser
  (M2 gate work will add Playwright coverage per PLAN §22).
- **Listen loop verified** (`src/lib/listen/record.test.ts`): heartbeats grow
  session + resume monotonically, end computes 85% completion, completed tracks
  clear their resume point, drop reports are one-per-session, and the library
  entitlement filter seals by level and hides drafts.

## 2026-07-11 — Deployment path (Akasha chose "get it online to test")

- **Admin pin by email.** Added `ADMIN_PATREON_EMAIL` alongside
  `ADMIN_PATREON_USER_ID`; `isGoddessIdentity()` matches either (email
  case-insensitive). This lets Akasha claim admin with a value she already
  knows, removing the numeric-id hunt from setup. Unit-tested
  (`src/lib/patreon/admin.test.ts`).
- **Turnkey production stack** (`compose.prod.yml` at repo root + `deploy/`):
  Caddy reverse proxy with automatic Let's Encrypt HTTPS (domain from
  `APP_DOMAIN`), web + worker + transcriber + postgres. Media starts on a local
  Docker volume (`MEDIA_LOCAL_DIR=/media`); Bunny is a later env-only switch.
  `deploy/bootstrap.sh` installs Docker, validates `.env`, and brings the stack
  up in one command. `/api/health` added for readiness/uptime checks.
- **Compose at repo root** (not under `deploy/`) so `build: context: .`,
  `env_file: .env`, and `./deploy/Caddyfile` all resolve from the project root
  when run as `docker compose -f compose.prod.yml …`.
- **Verified natively, not in Docker here.** This sandbox's proxy blocks Docker
  registry pulls, so the container couldn't be built/run in-session. Instead
  verified the equivalent: production `next build` + `next start` boot, `/api/health`
  returns `{ok:true}` (DB reachable), routes serve, `/sanctum` redirects when
  unauthed. `compose.prod.yml` passes `docker compose config`. The Docker build
  itself runs on Akasha's server, where registry access is normal.
- **Runbook:** `docs/DEPLOY.md` — non-technical, step-by-step (domain → Hetzner
  server → DNS → Patreon app → one-command launch → first upload/listen test).

## 2026-07-11 — Deploy troubleshooting (live with Akasha)

- **Pinned pnpm@10.33.0** (`packageManager` field) — the Docker build let
  corepack fetch pnpm 11, whose minimum-release-age policy rejected two
  just-published transitive deps. Pin matches the committed lockfile.
- **Docker build placeholder envs** — `next build` imports route modules (env
  validation runs at import) but `DATABASE_URL` only exists at runtime, so the
  build failed. Set throwaway `DATABASE_URL`/`AUTH_SECRET` in the build stage;
  verified the build never connects (`next build` passes with an unreachable
  host). Added `.dockerignore` (no secrets/bulk in the image) and `public/.gitkeep`.
- **AUTH_URL from APP_ORIGIN** — behind Caddy, Auth.js resolved its URL to
  localhost and OAuth callbacks broke (`error=Configuration`). Set
  `AUTH_URL=${APP_ORIGIN}` + `AUTH_TRUST_HOST=true` on the web service.
- **bootstrap adds swap** on <3GB servers so the first `next build` can't OOM.

## 2026-07-11 — M2 build (PWA + push)

- **Hand-authored service worker** (`public/sw.js`) rather than a generated one:
  push + notificationclick + network-first navigations + minimal shell cache.
  Kept legible/stable; no build step. API and audio-stream paths are never
  intercepted.
- **Gate enforcement is server+client.** Age + hypnosis-terms consent is stored
  in `consents` and checked server-side in the subject layout; install +
  notification steps are checked/handled client-side in `SubjectGate`.
- **Install/permission steps are guided but SOFT.** A browser tab cannot reliably
  detect "added to home screen" (the installed PWA is a separate context), and
  push permission can be denied — forcing either would lock subjects out. So the
  Gate instructs and lets them proceed, recording device state. Consent is the
  only hard gate. Hard install-enforcement is not worth the lock-out risk.
- **Push requirement is conditional on configuration.** If VAPID keys aren't set
  yet, the notification step is skipped (the app is fully usable pre-VAPID); once
  keys are added, the Gate asks for permission and `broadcast()` delivers.
- **Quiet hours enforced by skipping, not deferring.** Non-system notifications
  to subjects currently inside their quiet window are held back (delivery row
  marked `queued`, not sent). True deferred re-send belongs to the pg-boss
  worker (a later milestone); skipping is the honest MVP that avoids 3am pings.
- **Inbox "unseen" is client-side** (localStorage timestamp vs newest
  notification) — no schema change for M2; a server-side read model can come
  later if needed.
- **Push send/audience/quiet-hours verified** (`broadcast.test.ts`,
  `quiet.test.ts`) with `web-push` mocked: audience expansion (all/level/users),
  personalization, delivery recording, no-device + quiet-hours skip paths.
  Real device delivery is verified on a phone after deploy.

## 2026-07-11 — M3 build (transcription + organize)

- **Transcription: self-hosted Whisper, free (Akasha's call).** ElevenLabs
  Scribe is more accurate but paid (~$0.40/hr after a small free tier); she
  asked to start free. Built a `TranscriptionProvider` interface with a Whisper
  adapter (posts audio bytes as multipart to the sidecar); an ElevenLabs adapter
  is a future drop-in behind the same interface. `WHISPER_MODEL` default `base`
  (light for small servers). Real model enabled by default (`TRANSCRIBER_STUB=0`).
- **Sidecar takes bytes, not storage access.** The web/worker reads audio via
  `mediaProvider.readBytes()` (added to local + Bunny) and POSTs multipart to the
  sidecar, so the transcriber needs no media-volume mount and works identically
  for local and Bunny storage. Audio never leaves the server.
- **Transcription is fire-and-forget** from the admin action (marks `processing`,
  runs in the background on the persistent Node server, updates to `done`). A
  pg-boss queue is the eventual home for very long files; adequate for now.
- **Organize agent works with NO LLM key.** A heuristic pass (title bracket
  tokens + transcript keyword scan + known-trigger matching with segment
  timestamps + title→program patterns) produces real proposals from Akasha's
  own conventions. An optional Anthropic pass (`ANTHROPIC_API_KEY`, direct
  Messages API, zod-validated, returns null on any failure) blends in when
  configured. Chosen because she has ElevenLabs (voice) but not necessarily an
  LLM key — organize must work regardless.
- **Nothing auto-applies.** Every organize run writes a pending `review_queue`
  row; the Sanctum Organize page approves/rejects per track. Approval is
  idempotent (tags/triggers/playlist placements de-duplicate). Granular
  per-proposal editing is a follow-up; per-track approve/reject ships now.
- **Trigger vault populated on completion** — completing a track that `installs`
  a trigger writes `user_triggers` (A5 data; the vault UI itself is M6).
- **FTS via on-the-fly query, no schema change** — deferred the `tracks.fts`
  tsvector column; transcript search can compute `to_tsvector` on demand at this
  scale. Add the generated column later if search gets heavy.
- **Verified** (`heuristic.test.ts`, `apply.test.ts`): title/keyword→tags,
  known-trigger detection with evidence + relation, program suggestions,
  no-hallucinated-triggers; apply creates tags/triggers/playlist placement,
  marks approved, and is idempotent. 93 tests total. Real Whisper transcription
  of a live file is verified on the server after `up -d --build`.

## 2026-07-11 — M4 relationship core

- Intake gated on `users.chosenName`; narrative answers stored as
  `question_answers` (kind intake). Collar Card + rename ritual (notifies in
  voice). Chain of Obedience: tz-aware day-boundary (pure, tested) kept by
  listen≥threshold or mantra. Whispers (one-way feed + kneel), Polls (pure
  tally, tested), ritual questions — all via `broadcast()`. Messages strictly
  subject↔goddess (D7), rate-limited, keyword safety-triage (pure, tested) →
  flagged threads pinned + no AI draft. AI drafts via Anthropic (voice_corpus +
  BRAND), draft-first, disabled without a key. CRM profiles with merged
  timeline + one-tap personal push. 116 tests.

## 2026-07-11 — M5 commissions / offline / lapse

- Library queries now honor per-user `grants` (streaming + listing) so
  commission deliveries appear privately ("Made for you"). Commission form is
  admin-editable (settings). Offline: WebCrypto AES-GCM, non-extractable device
  key, IndexedDB; player prefers the offline blob; sync/purge on launch. Lapse
  frozen state seals library + purges offline; progress preserved. 118 tests.

## 2026-07-11 — M6 scale (v1.1)

- Worker is an **interval scheduler, not pg-boss** (v1 simplicity at this
  scale): always closes expired polls; presence automations (inactive-reclaim,
  chain-broken) gated behind `automations_enabled` (default off, respects quiet
  hours). Descent ranks (pure, tested). Orders feed the chain. Trigger-vault
  prereq gating is soft (informational). Threshold is a public funnel page. 124
  tests. Worker verified to boot + resolve `@/` under tsx.

## 2026-07-11 — M7 hardening / launch

- **GDPR**: `/api/me/export` (full JSON download) + `/api/me/delete` (hard
  delete via FK cascade; goddess can't self-delete). Subject Settings: quiet
  hours, timezone, theme opt-outs.
- **Legal**: `/terms` (adults-only; a practice not treatment; never while
  driving; consent) + `/privacy` (identity/kink separation, no trackers, export/
  delete). Linked from the landing footer.
- **CSP**: app-safe policy in next.config (script/style keep 'unsafe-inline' —
  App Router has no nonce; media/img/connect allow https:+blob: for Bunny +
  offline). Plus Permissions-Policy + existing headers.
- **Analytics**: internal-only Sanctum dashboard (per-track plays/completion/
  listeners/mean-depth, DAU/WAU) via raw SQL — no third-party trackers.
- **Backups**: `scripts/backup.sh` (pg_dump | gzip | optional age | optional
  Bunny upload) + cron/restore-drill instructions.
- v1 complete: M0–M7. Full launch checklist in docs/DEPLOY.md.

## 2026-07-12 — Design pass ("editorial-occult")

- Full visual identity applied via the token contract (D8): new palette
  (violet-black / bone / oxblood / antique gold), Cormorant Garamond loaded
  via next/font (was silently falling back to Georgia before), system body
  face, letterspaced small-caps labels, film-grain overlay, ornament rule,
  slow-wheel landing motif, roman-numeral depth scale. Full spec: docs/DESIGN.md.
- Anti-"AI look" constraints enforced: no Inter, no gradient-purple, no glass
  cards, no emoji controls (replaced with a hand-drawn SVG icon set in
  src/components/ui/icons.tsx; audited by a subagent sweep).
- Mobile IA fix: subject nav moved to a 5-tab bottom bar (safe-area aware,
  active states); secondary rooms (Asks/Orders/Commission/Settings) became
  cards on the You page; mini-player floats above the bar. Desktop keeps a
  letterspaced header row. Sanctum: scrollable rail on mobile, sticky sidebar
  on desktop.
- Spiral canvas fallbacks + clear color updated to the new palette; manifest/
  themeColor #0b0812; viewportFit cover for iOS safe areas.
- playwright-core added as a dev dep (drives the preinstalled Chromium) for
  design screenshots; verified landing (mobile+desktop) and /styleguide
  visually. Note: fixed grain overlay stitches oddly in full-page screenshot
  tools; live rendering is uniform.
- 124 tests, typecheck, lint, prod build (incl. build-time font fetch) green.

## 2026-07-12 — v1.5 C1.1: durable job queue (deviation from pg-boss)

- PLAN §18 named pg-boss for background jobs; the M0 worker shipped as an
  interval scheduler instead. C1.1 keeps that process but adds a lightweight
  durable queue in our own Postgres rather than adopting pg-boss — one `jobs`
  table + `FOR UPDATE SKIP LOCKED` claim, per-kind in-process concurrency, and
  backoff retries (1m/5m/15m, 3 attempts). Rationale: zero new deps, one
  connection pool, full visibility in the same DB the Sanctum already reads,
  and it is exactly enough at single-worker scale. If we ever run multiple
  worker replicas, the per-kind concurrency cap must move from in-process
  counters to a DB-derived running count (documented here as the upgrade path).
- The web process now only *enqueues*; `requestTranscription` enqueues a
  `transcribe` job (dedupeKey `transcribe:<trackId>`) instead of a
  fire-and-forget promise, so transcription survives a web restart.
- `transcribeTrack` now re-throws after recording the failed status, so the
  queue can retry; its one legacy caller already guarded with `.catch()`.
- Idempotency: a partial unique index (`jobs_dedupe_active_uq`) allows at most
  one active job per dedupeKey; `enqueue` uses `ON CONFLICT DO NOTHING`.
