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

## 2026-07-12 — v1.5 C1.3: auto-pipeline + auto-apply (deviation from F5 "nothing auto-applies")

- PLAN §8 / the F5 organize design held that NOTHING applies without the
  goddess approving it in the review queue. C1.3 adds an opt-in auto-pipeline
  (setting `auto_pipeline`, default on): an upload chains transcribe → organize
  automatically, and a new `organize_auto_apply` dial controls how much lands
  without review:
    - `review_all` — original F5 behavior (nothing auto-applies).
    - `tags_only` — DEFAULT: tags + playlist placements apply automatically;
      trigger proposals still queue for review (triggers are safety-relevant).
    - `everything` — tags + triggers + playlists apply; the review row is
      marked approved (system actor) and Organize becomes an undo/curate view.
  This is Akasha's explicit ask ("import-everything, organize-everything") and
  it stays entirely her dial in Sanctum → Access. Auto-apply reuses the
  idempotent apply helpers, so a later manual approval re-applies harmlessly.
- New `tracks.pipeline` column (uploaded → transcribing → organizing → ready |
  failed_transcribe | failed_organize) drives the live status in the reactive
  library; existing rows backfilled to `ready` in 0002_track_pipeline.sql.
- Pipeline transitions + the transcribe→organize chaining live in the job
  handlers (one visible state machine); triggers still never auto-apply under
  `tags_only`, preserving the safety posture for anything trigger-related.

## 2026-07-17 — R4 (series collections + Spotify queue)

- **Split queue model in the player store.** `manualQueue` (explicitly queued,
  always first, consumed on play) vs `sourceQueue` + `sourceName` + `sourceIndex`
  (the series/shelf started). `playNow` is retained as a thin wrapper over the
  new `playSource(tracks, name, startIndex)` with a null name, so every prior
  caller (library, file page, continue shelf, programs) keeps working unchanged.
  End-modes / sleep / grounding / telemetry heartbeats / resume are untouched.
- **Seek is bridged, not direct.** UI calls `seekTo(positionS)`, which bumps a
  `seekRequest {positionS, seq}`; PlayerRoot (the sole audio owner) applies it to
  the element and clears it. Media Session `seekbackward/seekforward/seekto` +
  `setPositionState` route through the same path. As a side effect, prev-to-
  restart now issues a real seek to 0 (the old code only reset store position, a
  latent no-op on the element).
- **Queue-sheet rows show a sigil placeholder, not per-row artwork.** `QueueTrack`
  carries only a raw `artworkKey`, which is never signable on the client and must
  never be exposed as a raw storage URL (CLAUDE.md privacy). Rather than issue N
  per-row signing round-trips, queue rows render the 888 mark (the "Now" row
  breathes while playing). Series/file cover art is still signed server-side.
- **`jumpTo` semantics (Spotify parity).** Tapping ahead in the manual queue
  plays that item and discards the ones above it; tapping a "Next from: <source>"
  item moves the source pointer and leaves the manual queue intact.
- **`playlists` gained `artworkKey` + `cadence`** (reusing the `program_cadence`
  enum, default `ongoing`) in `0008_series_v2.sql`. Curated series are now first-
  class in Sanctum (`/sanctum/series`): cover upload via a raw-body route
  (`POST /api/sanctum/series-art`, ≤5MB, webp/jpeg/png, keyed `art/<playlistId>.webp`),
  details edit, add/remove tracks, and Up/Down reorder (sequential-sort rewrite —
  no drag dependency). The series-segment cards now surface the real cadence.

## 2026-07-17 — R5 (Tasks/Orders v2 + the 5-tab IA)

- **`order_assignments` gained `proof_at timestamptz`** beyond the spec's
  `proof_key` + `praised_at`. The Sanctum proof-review strip must show proofs
  "newest first", but nothing else recorded *when* a proof was attached
  (`done_at` is completion, not upload; a required-proof order is uploaded
  before it can be done). `proof_at` is set alongside `proof_key` in the proof
  route and orders the review strip (`desc(proof_at)`). All three columns land
  in one migration, `0009_orders_v2.sql`.
- **Home tab labelled "Whispers", not "Home".** The v2 IA line reads
  "Home(Whispers)"; `/` is the whispers feed merged in R1 (`copy.whispers.title`
  is already "Whispers"). Keeping the in-voice label avoids generic app-speak
  while honouring the approved five-tab set (Whispers · Library · Tasks ·
  Messages · You). All five labels now come from `copy.nav.*`.
- **"non-expired order" in the pending-badge spec is a no-op today.** `orders`
  has no `expiresAt` column (only `dueAt`, a deadline). `pendingTaskCount`
  therefore counts assignments with status in (`sent`,`seen`); an overdue task
  is *more* pending, not expired, so it keeps the tab pulsing and shows danger
  styling on its card. If order-expiry is introduced later, add the filter here.
- **DesktopNav reduced to the five tabs.** It previously carried Asks + Orders
  as extra links; both are reachable from the You page (R6), so the desktop row
  now matches BottomNav exactly.
- **Sanctum order/proof-review strings stay inline English.** Consistent with
  every existing Sanctum page (admin-facing, not subject-facing). Only the
  subject Tasks page and the two pushes (order received / proof praised) are
  routed through `copy.ts` — `copy.tasks.*`, including the moved
  `receivedPush.title` ("An order.").
- **`MediaProvider.putBlob(key, bytes, contentType)`** added to the interface
  and both providers (local writes under the key; Bunny uses the same PUT path).
  Proofs are stored at `proofs/<orderId>/<userId>.{webp,jpg,png}` and served
  only through the existing signed-URL pattern — raw keys never leave the server.

## 2026-07-17 — R6 (You v2 + Ask + Secret mode)

- **The disguise pool bypasses the copy.ts voice rule ON PURPOSE.**
  `src/lib/push/disguise.ts` holds the Secret-mode messages ("Reminder — Drink
  some water today", weather, generic "Daily" reads). CLAUDE.md's golden rule is
  that every subject-facing string lives in `copy.ts` in Akasha's voice — this
  is the single deliberate exception, and it must be. The whole point of Secret
  mode is that what reaches the lock screen looks like nothing; in her voice it
  would defeat itself. The file carries a header explaining this, and it never
  imports or touches `copy.ts`. The *normal* preview shown beside it (her voice)
  does come from `copy.secret.*`.
- **Single push choke point = `sendToDevice`.** Every notification the platform
  sends funnels broadcast → `targetsForUsers` → `sendToDevice`, which is the
  only caller of `webpush.sendNotification`. Secret mode is enforced there, once:
  if the recipient's `disguise` flag is set the payload's title/body/icon are
  rewritten (deep link + tag preserved) before it leaves the server. The flag is
  resolved in one batched query in `targetsForUsers` and is a **required** field
  on `DeviceTarget`, so the type system forces every target to carry a disguise
  decision — a future sender can't accidentally skip it. Stored `notifications`
  rows and in-app rendering keep her real words; only the wire payload changes.
- **Manifest became a dynamic route handler.** Replaced the static
  `app/manifest.ts` metadata convention with `app/manifest.webmanifest/route.ts`
  (force-dynamic, no-store) so the PWA identity can vary per session: Secret mode
  on → neutral name/short_name "Daily" + a plain grey SVG icon
  (`public/icons/disguise.svg`, deliberately non-brand); off → the normal AKASHA
  manifest. `metadata.manifest` in the root layout still points at
  `/manifest.webmanifest`, so nothing else changed. In-app hint under the toggle
  notes that a fresh install is needed to also disguise the installed app name.
- **Secret-mode toggle is an own-user server action.** `setDisguiseMode` in
  `src/lib/profile/secret.ts` (zod, `logAudit` with the subject as actor) is
  shared verbatim by the You-page card and the Gate's notification step, so both
  write `users.disguiseMode` identically. Auditing a subject's own action (actor
  = their id) is intentional; it is not a Sanctum mutation but the phase asks for
  it explicitly.
- **No subject-facing self-rename ritual exists, so the collar name is shown as
  identity only.** Renaming remains the goddess's act (Sanctum → subject → rename,
  via `copy.rename`); there is no subject route that lets someone rename
  themselves, and inventing one is out of R6 scope. The You page surfaces the
  collar name prominently (honorific + chosen name) without a fabricated
  self-rename link.
- **`wishes` gained `title`, `reply`, `repliedAt` (migration `0010_you_v2.sql`).**
  `title` is nullable so every pre-R6 wish (intake + old wishbox) keeps working.
  The Ask form posts `{title?, body}` to the existing `/api/wishes`, which now
  also `notifyGoddess`-es (admin-facing inline English, per the R5 convention)
  and audits the create. Her Sanctum reply pushes only to that one subject in
  voice ("She answered your petition."), respecting quiet hours.

## R7 — Notifications everywhere (2026-07-17)

- **Rank-up is detected against the `moments` ledger, not a stored rank.** Ranks
  were never persisted — the You page derives them live from files-completed +
  chain length via the pure `rankFor(DESCENT)`, and the `ranks`/`user_ranks`
  tables are dead schema (never read or written). So `recordRankProgress`
  (`src/lib/ranks/promote.ts`) treats the newest `rank_up` moment's payload as
  "the last rank we told them about" and fires only when the fresh rank sits
  higher on the Descent. The **first** observation of any subject writes a
  *silent* baseline moment (shownAt set, no push) at their current rank, so
  subjects already deep before R7 don't get a false "you have risen" on first
  hook — only genuine crossings after that celebrate. Hooked at the two score
  inputs: `keepChain` (chain growth — covers listen/mantra/order in one place)
  and `recordEnd`'s completion branch (files). The helper never throws so it can
  never break a listen, mantra, or order response.
- **Deadline warnings run ungated (unlike presence automations).** The new
  hourly `deadlineWarnTick` in the worker is NOT behind `automations_enabled`:
  it surfaces deadlines she explicitly set on orders, not a presence ping, so it
  always runs. Quiet hours are still respected (`respectQuietHours: true`), and a
  subject held back purely by quiet hours is left un-`deadlineWarnedAt` so the
  next hourly tick retries once they're out of it; any real attempt (sent /
  no-device / failed) stamps the mark so a task is warned at most once. Batched
  per subject → one push even when several tasks loom.
- **Series-add push is shared + deduped by deep link.** `notifySeriesTrackAdded`
  (`src/lib/series/notify.ts`) is called from both add-to-series sites (the
  Series board and the dossier Placement panel). It pushes `{type:"all"}` only
  when the series is published, and collapses bulk adds by skipping if a
  `notifications` row already carries the same series deep link within the last
  10 minutes. Best-effort (never throws) — the placement already succeeded.
- **New-file push guards on `publishedAt` being previously null.** The publish
  action reads the track's prior `publishedAt` before updating; only the
  first-ever publish announces (to `{type:"level", level: minAccessLevel}`), so
  unpublish→republish never re-pushes the same file.
- **`moments.payload` is `notNull().default({})`** (matching the `jobs` table
  convention) rather than a bare nullable default, so readers never handle null.

## R8 — Manual Patreon import, professional (2026-07-17)

- **Imported posts are SHELLS by default, not skips.** Patreon's API cannot
  hand over post audio (verified 400 on `attachments_media` downloads — a
  platform limitation), so `importPatreonPost` no longer returns early on a
  no-audio post: it creates a draft `tracks` row (title + HTML→text description
  + `source='patreon_import'` + `patreonPostId`, no `streamKey`) and logs
  `patreon.shell_created`. The rare post that *does* yield a downloadable audio
  keeps the full ingest path. Idempotency is unchanged (the pre-existing
  `patreonPostId` guard), so re-import is a no-op. **No schema change** — a shell
  is just `source='patreon_import' AND stream_key IS NULL`; the roadmap's
  conceptual `needs_audio` status is expressed by that predicate, not a new enum
  value (there is no `needs_audio` in `pipelineStatus`, and the pipeline stays
  `uploaded` until audio is attached).
- **Attach reuses the streaming upload route via an optional `?trackId=`.**
  `POST /api/sanctum/upload` gains an attach branch: validate uuid → track must
  exist (404) → `streamKey` must be null (**409** if it already has audio) →
  stream the body to a temp file → `attachUploadToTrack` (new in
  `media/ingest.ts`: `putOriginal` + `putStream` + duration probe, updates
  `streamKey`/`durationS` and resets `pipeline='uploaded'`). Same auto-pipeline
  enqueue as the create path; audit `track.audio_attached`. The create path is
  untouched.
- **Filename↔shell matcher is pure + dep-free** (`src/lib/patreon/match.ts`,
  unit-tested). `scoreMatch` blends token-overlap (Sørensen–Dice on the word
  sets, weight 0.6) with character-bigram Dice (weight 0.4), both after a shared
  normalize (lowercase, strip audio extension + punctuation/underscores).
  `proposeMatches` ranks every file↔shell pair ≥ floor (0.2) and assigns
  greedily highest-first, never reusing a file or a shell — so a confident pair
  claims its shell before a weaker contender, and losers come back unmatched
  rather than mis-assigned. `high` chip ≥ 0.55, else `uncertain`.
- **Bulk attach is a client island** (`/sanctum/import/attach`) that reuses the
  shared upload primitives. The XHR `probeDuration`/`uploadAudio` helpers were
  **extracted** from `library/UploadQueue.tsx` into `sanctum/upload-client.ts`
  and are now shared by the UploadQueue, the per-row `AttachButton`, and the
  bulk `AttachClient` (concurrency 2, per-file progress, per-row reassign/skip
  dropdown, retry on failure). No wholesale duplication.
- **Waiting-shell count is a local fact.** The Import page's "Attach audio (N
  waiting)" banner and the attach screen both read `listWaitingShells()` (a
  local DB query), so the affordance holds even when Patreon is momentarily
  unreachable. Shell rows on the Import page show a `shell · needs audio` badge
  (replacing the old `no audio`) plus an inline single-file attach picker.
- **Shells degrade gracefully with no audio (verified, no change needed):**
  Publish stays disabled (`hasAudio` guard); `transcribeTrack` returns early on
  a null `streamKey`; the dossier's "Run analysis" still fills from the
  heuristic floor using title + description (empty transcript is handled), so a
  shell can be analysed/described before its audio ever arrives.

---

## 2026-07-17 — Fix Pass 1 (QA teardown majors F01–F14)

- **One persistent audio engine at the app root.** `PlayerRoot` (the single
  `<audio>` + mini-player/fullscreen/queue chrome) moved from the `(subject)`
  layout into the root layout (`src/app/layout.tsx`). It now survives every
  navigation, so playback and the Spotify-style mini-player never restart when
  crossing between the Whispers Home (`/`) and the tabs. The engine is inert
  until a track loads; its visible chrome hides on `/sanctum` (which has its own
  verify player) and the ritual/auth screens via a pathname guard inside
  `PlayerRoot`. This is the cleanest way to satisfy F10 without a shared layout
  between `/` (outside the route group) and the tabs.
- **`SubjectShell` unifies the signed-in chrome (F10).** Extracted the header +
  tab nav + moment checker + offline sync (minus the now-root PlayerRoot) into
  `src/components/nav/SubjectShell.tsx`. Both the `(subject)` layout and the
  signed-in branch of the Home page render it, so `/` wears the exact same shell
  as every tab (Whispers tab active) and the moment overlay now fires on Home
  too (closes F07 as a side effect). Anonymous `/` keeps the public front door.
- **Mini-player is one object with the nav (F11/F12).** `MiniBar` is full-bleed
  and docked flush on top of the tab bar (`bottom: calc(3.5rem + safe-area)`),
  raised surface over the deeper nav — two shelves, one unit. Anatomy after
  Spotify's: 888 sigil artwork (breathing while playing, privacy-safe — we never
  sign art keys client-side, D7), title with an overflow marquee, source line,
  queue, and a play/pause with a real pressed feel (`active:scale-90`). The
  tap-to-seek line rides the top edge. Fullscreen player left untouched.
- **One duration formatter everywhere subject-facing (F13).**
  `src/lib/format/duration.ts` — m:ss under 10 min, "X min" to an hour, "1h 12m"
  beyond — replaces four copies of a `{m} min` helper that floored 30s clips to
  "0 min". The unused `copy.library.filePage.duration` template was removed.
- **Whisper composer can't 500 on a mis-filled poll (F03).** `publishWhisper`
  returns a friendly `WhisperFormState` via `useActionState` instead of throwing;
  the new client `WhisperComposer` disables submit until a chosen poll / typed
  question / picked subject is present. Belt and suspenders.
- **Commissions state machine (F04).** Sealed → only the waitlist petition (no
  field form); open + a live request → progress bar + an in-voice "one at a
  time" line; open + nothing → the form. `submitCommission` refuses a duplicate
  active request server-side; the API skips required-field validation for a
  waitlist ping and returns 409 on a duplicate.
- **"Run analysis" shows its work (F02).** New goddess-gated
  `/api/sanctum/tracks/[id]/analysis-status` reports the dossier's `updatedAt`
  and the latest analyze job's state. The dossier polls it (reusing `usePolling`)
  while a run is in flight, shows "She is reading it…", refreshes when the
  reading lands, and surfaces a failed job's error. (F01 proper — seeded rows
  never analysed — was a QA-sandbox artifact: the worker wasn't running. With it
  up, this flow is now observable.)

## 2026-07-17 — R9a (creative additions, batch 1: R9.1 + R9.9a + R9.9b)

- **Live presence needs a heartbeat clock (R9.1).** `listen_sessions` had no
  per-heartbeat timestamp — only value columns (`seconds_listened`,
  `max_position_s`) and the one-shot `started_at`. Added `last_heartbeat_at`
  timestamptz, stamped on every `recordHeartbeat` (insert + update). "Currently
  under" = open session (`ended_at` null) whose last beat is within
  `LIVE_WINDOW_MS` (90s ≈ a couple missed 10s beats). The window + the
  minutes-in/depth shaping are pure (`src/lib/listen/live.ts`, unit-tested);
  only the join that feeds them touches the DB. Live view is goddess-only —
  collar names never leave the Sanctum (D7).
- **Touch is a moment kind, not a push (R9.1).** One-tap/free-text lines write a
  `moments` row kind `touch` (`{text}`), audited, NO push (they're in-app). The
  subject overlay polls `/api/me/moments?kinds=touch` only while audio plays.
  **Collision with the session-start ritual is prevented server-side:** the
  default moments query (the ritual queue) now excludes kind `touch`
  (`ne(kind,'touch')`), and the `touch` branch is its own channel that also
  expires unshown touches older than 10 min query-side (`gt(created_at, …)`).
  `Moments.lineFor` already returns null for unknown kinds — belt and suspenders.
  The overlay (`Touch`) mounts inside `PlayerRoot`'s subject chrome at `z-[60]`
  (over the `z-50` fullscreen), `pointer-events-none` so it never steals a tap —
  a line that breathes in, holds ~6s, fades; reduced motion collapses to
  appear/vanish via the global transition reset. It is a deliberately different
  surface from the ritual dialog, so the two never visually clash.
- **`usePolling` promoted to `src/lib/hooks/`.** It lived under
  `app/sanctum/library/`; the subject touch overlay + the live panels reuse it,
  so importing Sanctum-route code into subject chrome was a layering smell.
  Moved to `@/lib/hooks/usePolling` and re-pointed the two existing imports
  (LibraryClient, DossierClient). Pure relocation, no behaviour change.
- **One whisper-push path (R9.9a).** Extracted `sendWhisperPush`
  (`src/lib/feed/publish.ts`) — the body-vs-poll-question fallback, title, deep
  link, audience. Both immediate publish (composer action) and the 60s scheduled
  worker tick call it, so they cannot drift. The two push titles moved from
  inline literals into `copy.whispers.{whisperedPush,askingPush}` (they're
  subject-facing — the golden rule wants them in `copy.ts`). Scheduling saves the
  whisper with `published_at` null + `scheduled_for`; every feed query already
  filters on `published_at`, so it stays invisible until the tick claims it
  (`UPDATE … WHERE published_at IS NULL` — restart/overlap-safe) and fires the
  push. Sanctum list gains a `scheduled · <when>` badge + audited Cancel (delete,
  guarded to unpublished only).
- **Auto-welcome on first connect (R9.9b).** Fires from the `auth.ts` `signIn`
  event (which already knows `isGoddess` and only runs for Patreon) rather than
  the adapter `createUser` event, because goddess exclusion + the settings read
  live there. Guarded once-ever on an empty thread; reuses `sendGoddessMessage`
  (which already pushes "She spoke to you." and trains the corpus). Never throws
  — a welcome must not block sign-in. New typed settings `welcome_dm_enabled`
  (default true) + `welcome_dm_text` (default seeded from
  `copy.messages.welcomeDefault`), both editable in Sanctum → Access. Chose typed
  `SETTINGS_DEFAULTS` keys over raw settings since they're a fixed contract.
- **Migration `0012_r9a.sql`** — the two additive columns only
  (`listen_sessions.last_heartbeat_at`, `whispers.scheduled_for`). Gate green:
  typecheck · lint · 181 tests (170 + 11 new pure live tests) · build.

## R9c — The Oath (R9.5) + Premieres (R9.6) (final phase)

- **The Oath — the collar.** New `users.oath_petitioned_at` + `users.oath_at`
  (null = uncollared). Pure state machine `src/lib/oath/logic.ts`
  (sealed→eligible→petitioned→collared, precedence collared>petitioned>eligible>
  sealed) unit-tested; `oath/resolve.ts` feeds it the live chain length + the new
  `oath_min_streak` setting (typed, default 21, editable in Access). You page
  gains an `OathCard` below the chain with all four states; the petition CTA opens
  a ritual confirm overlay (Display→Ornament→Whisper→CTA, DESIGN rule 4) →
  `POST /api/oath/petition`. `oath/ops.ts` re-checks eligibility server-side and
  claims each transition with `WHERE … IS NULL` so replays never re-notify. Accept
  sets `oath_at`, clears the petition, queues a `moments` row kind `collared`
  (added to the Moments overlay) and pushes in voice (quiet hours yield); decline
  clears the petition silently (no push). Petitions surface on Sanctum Today +
  the subject profile with Accept/Decline.
- **New `{type:"oath"}` audience.** Extended the `Audience` union +
  `expandAudience` (active subjects with `oath_at` set) + `audienceMatches`
  (gained an `isCollared` param, default false → fail-closed for surfaces that
  never target it, e.g. polls/questions). Threaded `isCollared` through
  `whispersForSubject` so the collared feed sees `oath` whispers. Composable in
  the whisper composer + broadcast audience pickers ("The Collared").
- **Monthly gift (`oath/gift.ts`).** Daily worker tick; guarded once-per-month via
  raw stamp `oath_gift_last_granted="YYYY-MM"`. Grants the raw-setting
  `oath_gift_track_id` (she sets it in Access) to every collared subject who
  **lacks a grant row** for it (KEEP-SIMPLER reading of "lack it"), then pushes
  "A gift for the collared." to only the newly-granted. Stamp is written last so a
  mid-run failure retries; if no track is configured it waits without stamping.
  Gift push uses kind `automation` so it **respects quiet hours** (a gift, not an
  appointment) — unlike the accept push (bypasses) and premiere push (bypasses).
- **Premieres.** New `tracks.premiere_at` + `tracks.premiere_announced_at`. Pure
  `src/lib/premiere/logic.ts` (`isPremiereSealed` = non-null & strictly future;
  `premiereDue`; `parsePremiereInput`) unit-tested. A published track with a
  future premiere is visible in the catalog + file page but sealed from play — a
  glowing countdown ("It begins {when}." via new `formatUntil`), distinct from the
  level-locked veil. `stream-url` refuses it (`isPremiereSealed` → 404) for
  **everyone incl. free samples** — the sample flag does not bypass a future
  premiere. Worker `premiereTick` (60s) announces due premieres to their level
  ("It's time. Come under.", quiet hours yield), claiming each via
  `premiere_announced_at` so it fires once. Editable in the Sanctum library drawer
  + the dossier.
- **R7 publish-push interaction.** `setTrackVisibility` reads `premiere_at`: a
  first publish with a **future** premiere **suppresses** the immediate new-file
  push (the premiere announcement replaces it); a premiere already in the **past**
  at publish fires R7 as normal and stamps `premiere_announced_at` so the tick
  never double-announces; no premiere → unchanged R7 behaviour. Editing a premiere
  re-arms `premiere_announced_at` only when the moment actually changes, so
  re-saving unrelated edits never re-fires "it's time".
- **Deviation — premiere datetimes are UTC.** The Sanctum datetime-local inputs
  are parsed as UTC and the input default is a plain slice of the stored ISO, so
  values round-trip exactly with no server-timezone dependency and no
  SSR/hydration drift. This differs from the R9.9a whisper scheduler's
  server-local `new Date(str)`; chosen deliberately because premieres are
  compared to `now` in the DB and determinism matters more than local-clock
  convenience for a solo-admin cockpit.
- **Migration `0014_r9c.sql`** — four additive columns only
  (`users.oath_petitioned_at`, `users.oath_at`, `tracks.premiere_at`,
  `tracks.premiere_announced_at`). Gate green: typecheck · lint · 216 tests
  (190 + 26 new pure oath/premiere tests) · build. DB-backed flows additionally
  smoke-tested end-to-end (17 checks) against `obeyakasha_test`.

---

## 2026-07-18 — Candlelit Atelier D2 (light & depth) + D3 (typography)

Implements `docs/DESIGN-DIRECTION.md` §D2 and §D3 only. Token-layer + primitive
work, applied surgically; D1 (art), D4 (motion), D5 (signature surfaces), D6
(audit) left untouched.

- **PageGlow stacking — base colour moved to `<html>`.** The ambient glow is a
  single fixed `<PageGlow/>` at `z-index:-10`. A negative-z layer is covered by
  an opaque `<body>` background, so the base near-black now lives on `html`
  (propagates to the canvas) and `body` is transparent. Chosen over
  `background-attachment: fixed` on body, which is janky/ignored on iOS Safari
  (this is a mobile-first PWA). One implementation, mounted once in the root
  layout — never per page.
- **`.breathes` (the gold breath) applied to the collar medallion only.** The
  utility exists, is reduced-motion-gated, and is demonstrated on `/styleguide`.
  Of its three intended homes (player artwork, collar card, premiere seal) only
  the collared `OathCard` medallion is a real surface today; player artwork and
  the premiere seal are built by their D5 rebuilds ("cover art with breathing
  aura", "gold seal"), so wiring `.breathes` onto today's placeholder markup
  would be thrown away. Deferred to D5 by design, not omission.
- **Eyebrows are content-true, not universal.** D3 asks page openers to carry an
  eyebrow "content-true, not decoration". Sanctum titles get their nav **wing**
  as the eyebrow (Catalog / People / Voice / Duties / System) — genuinely true
  structural info, and admin-only literals matching the existing `SanctumNav`
  convention (Sanctum is not subject-facing, so no `copy.ts` entry). Subject
  pages receive the **huge-opener scale** but no forced eyebrow: their only
  candid labels (e.g. Tasks → "What I want of you") already render as section
  `<Label>`s inside the page, so an eyebrow would duplicate them. Restraint over
  a redundant accessory. The full eyebrow+opener pattern is still shown live on
  `/styleguide` and across ~15 Sanctum pages.
- **Detail/splash openers left at their bespoke scale.** signin + threshold
  (ritual splashes with their own composition), the track/series detail pages
  (D5's "File page" hero rebuild), and Sanctum detail/sub-flows
  (`tracks/[id]`, `subjects/[id]`, `import`) keep `text-3xl` — a detail page
  reading a step below its section is correct hierarchy, and the detail heroes
  are D5's to rebuild.
- **Card `raised` now maps to `--elev-2`; MiniBar to glass + `--elev-3`.** No
  behaviour change — the mini-player keeps its layout, backdrop-blur, and every
  handler; only its surface treatment is now token-driven (`.glass .elev-3`).
- New tokens: `--elev-1/2/3`, `--glass-bg`, `--glass-blur`, `--page-glow-top`,
  `--page-vignette`, `--display-1`, `--display-2`, `--voice-size`. New
  primitives: `PageGlow`, `Eyebrow`, `Voice`, `PageHeading`, and a `size` prop
  on `Display`. All demonstrated on `/styleguide`. Gate green: typecheck · lint
  · 216 tests · build (39/39 pages). No schema, server-logic, player-store, or
  test-behaviour changes; no new dependencies.
