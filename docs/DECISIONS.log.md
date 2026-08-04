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

---

## 2026-07-18 — Candlelit Atelier D4 (motion) + D5 (five image-led surfaces)

Implements `docs/DESIGN-DIRECTION.md` §D1 resolver, §D4, §D5, and closes the
D2/D3 deferrals. Art resolver + display-chain wiring, token-level motion, and a
visual/structural rebuild of the five signature surfaces. No schema, migration,
worker, push, or auth change; the player store and its 23 tests are untouched.

- **Art resolver is pure + value-keyed.** `coverFamilyForTags(tags: string[])`
  matches lowercased tag *values* against the §D1 family table and returns the
  highest-priority family. "Theme outranks format/purpose" is enforced *by the
  priority order itself* — the three format/purpose families (sleep · ritual ·
  trance) sit last, so any theme family wins. This is the faithful reading of a
  `string[]` signature (no tag `kind` is passed), and it is exhaustively unit
  -tested (75 cases). Custom uploads are signed server-side via the existing
  media pattern; components never see a raw key.
- **`QueueTrack.artworkKey` now carries a resolved cover URL, not a storage key.**
  The store is frozen (23 tests), and the field was already an opaque,
  never-read passenger. Every enqueue site (library/series/continue/programs/
  surrender/file play) now resolves the cover (signed upload → bespoke default →
  default.jpg) *before* enqueuing, so MiniBar/QueueSheet/Fullscreen render real
  art with no client-side signing and no store change. Chosen over widening the
  store type (would touch the frozen surface). The old "we never sign client
  -side" placeholders are replaced by this pre-resolved value.
- **Feed art = her attached image, signed.** Whispers carry no track reference in
  the schema, so "art thumbnails where a track/poll is attached" is satisfied by
  signing the whisper's own `imageKey` into a short-lived `imageUrl` (new
  `WhisperCard` field) and rendering it as the card's editorial art; polls stay
  inline. Additive — no feed logic, audience, or copy changed.
- **View Transitions = CSS `@view-transition { navigation: auto }` + a token
  cross-fade, reduced-motion-gated.** Deliberately NOT a hand-rolled client
  router patch: Next 15 does not drive the SPA transition API without fragile
  history/pushState hooks that would risk the router. The CSS opt-in is
  dependency-free, degrades to nothing where unsupported, and covers full
  -document navigations today; client hops adopt it automatically once the
  framework drives the same API. Deviation from a literal client-side SPA
  cross-fade, logged here.
- **Entrance fill mode is `backwards`, not `both`.** `.enter`/`.enter-stagger`
  end at `translateY(0)`; with `both` fill that non-`none` transform lingers and
  turns every entered element into a containing block for `position:fixed`
  descendants — which would misplace the oath confirm dialog and any future
  fixed overlay inside an animated list. `backwards` holds the from-state through
  the stagger delay yet retains nothing after, so the rest state is the clean
  base (no transform). No scroll-triggered re-animation anywhere.
- **Hero height is an inline layout style.** A Tailwind incremental build dropped
  the arbitrary `h-[82svh]`/`min-h-[…]`/`-mt-[…]` utilities on the one full-bleed
  hero (verified via computed style: the classes were present but ungenerated).
  Height/min-height/negative-margin are layout, not design tokens (the "tokens
  only" rule governs colour/font/duration/shadow), so the hero sizes via
  `style={{ height, minHeight, marginTop }}` — deterministic, independent of
  class generation. A clean rebuild also restores generation for the rest.
- **Fullscreen player reconciles "cover centre-stage" with the kept spiral.** The
  spiral (variant + pace, untouched) becomes the ambient layer *behind* a
  breathing cover medallion; the same cover, blurred + dimmed via a cheap CSS
  filter, is the room light behind everything; the settings panel floats on
  `.glass .elev-3`. Grounding and all store logic are unchanged.
- **D2/D3 deferrals closed.** `.breathes` now lives on its three intended homes —
  the fullscreen player artwork, the file-page artwork (only while THAT track is
  the one playing, read from the store; presentation-only), and the premiere
  seal — plus the collar plate from D2. The track/series **detail openers** are
  raised to the huge opener scale (`Display size="opener"`), as the D2/D3 entry
  said the D5 hero rebuild would do.
- **You page separates by light where it counts.** The collar plate is
  ceremonial (collar-cover backdrop + the gold breath when collared) and the
  stat numbers are at display scale on a hairline-separated grid (light, not
  boxes). The Chain/Discretion/Vault groupings keep their existing card
  treatment — rebuilding those sub-components (SecretModeCard, TriggerVault,
  PetitionForm) is out of D5's scope and risks their behaviour.
- **New tokens + primitives, all on `/styleguide`.** Tokens: `--ease-out`,
  `--dur-enter`, `--dur-fast`, `--stagger`. Utilities: `.enter`/`.enter-stagger`,
  `.cover-frame`/`.cover-aura` (art hover), `.btn-sheen` (150ms warm sheen on
  `Button`), `.glow-gold`. Primitives: `Cover`, `EmptyState`. All motion is
  reduced-motion-gated (entrance animation + its delays removed, cover transition
  and view-transition stilled). No dependencies added.
- **Programs** is not one of the five surfaces, so it was not visually rebuilt;
  its enqueue payload + item covers were wired to the resolver for consistency
  (real art in the player chrome).

Gate green: typecheck · lint · **291 tests** (216 + 75 new pure resolver tests) ·
build (39/39 pages). Screenshots (desktop 1440×900 + mobile 390×844, signed-out
+ signed-in) committed to `docs/qa-shots/d5/`.

## 2026-07-18 — Candlelit Atelier D6 (design audit + fix pass)

Final audit of the D1–D5 elevation. 9 findings (`docs/QA-REAUDIT.md` §D6), 5
fixed. Visual/CSS/layout/asset only — no schema, store, worker, auth, or copy
change; the player store and its 23 tests are untouched. Notable decisions:

- **`public/art/empty.jpg` was a broken 36×36 sliver — restored, not re-created.**
  D1's "immutable art paths" held a corrupt file: `fetch-art.mjs` `trim()`s the
  white gallery matte off each piece, but the empty-state art ("one distant
  candle in vast darkness") has *no* matte, so trim read the near-black corner as
  background and ate the whole frame down to the flame (44×57 → committed 36×36).
  Re-fetched the same manifest source (1024²) and reprocessed *without* the
  over-trim — the intended image, not a new generation. Also guarded the script:
  if trim removes >55% of either side it's not a matte, keep the original.
  Restoring the intended asset is faithful to D1, not a deviation from it.
- **Library filter facets → one horizontal band.** The per-kind vertical stack +
  a `max-w-2xl` search on a `max-w-5xl` page left ~65% of the catalog width dead
  and misaligned with the grid. Facets are now inline kind-groups in a wrapping
  flex band; search fills the container. Pure layout; wraps to 2 rows at 390w.
- **Gate art wired to sign-in + threshold.** `gate.jpg` is committed and assigned
  to "sign-in / Gate backdrop, empty-state hero moments" in the D1 table but the
  auth surfaces (never part of the D5 five-surface rebuild) shipped text-only.
  Added it as a dimmed backdrop under a legibility scrim — image-led per D1.
- **Player cover imgs get an onError fallback (presentation-only).** The queue
  carries a pre-resolved cover URL (D5) that, for custom art, is a signed ~6h
  token. The store is not persisted (plain zustand), so a stale URL can't outlive
  a reload — the only exposure is a session left open past the TTL. A shared,
  idempotent `fallbackToDefaultCover` on the 4 player imgs swaps a broken cover
  for the default sigil. No store/state change; the frozen player surface stands.
- **Sanctum "Awaiting you" zero counts → em-dash.** The display serif's oldstyle
  `0` at `text-dim/40` reads as an ambiguous `()`; a zero now shows "—" (none) at
  `text-dim/50`, non-zero stays gold. A numeric empty-indicator, not prose.

Gate green: typecheck · lint (0 warnings) · **291 tests** · build (39/39 pages).
Curated screenshots replace `docs/qa-shots/d5/` with `docs/qa-shots/final/` (29).

---

## 2026-07-18 — Player v3: the nightstand (fullscreen rebuild)

Rebuilds `src/components/player/Fullscreen.tsx` only. The store
(`src/lib/player/store.ts`) is untouched — its 23 tests stay green.

- **Root cause of the cut-off options (confirmed + fixed).** The old fullscreen
  was `fixed inset-0 flex flex-col` with a fixed-px cover (`w-56 sm:w-64`) and a
  tall bottom `glass elev-3` block carrying every control, with no
  `overflow-y-auto` and no height compression. On short viewports (≈≤700px tall:
  a laptop with chrome, a landscape phone) the column's natural height exceeded
  the viewport and the bottom block slid off-screen, unreachable. Fixed two ways:
  the cover medallion is now capped in viewport-height terms
  (`w-[min(62vw,30vh,16rem)]` + `aspect-square`) so the whole stage always fits,
  and the tall control block is lifted out of flow into a **drawer** — collapsed
  it's a slim bar; expanded it's an absolutely-positioned sheet that floats over
  a still-mounted stage, so it never competes for column height. Verified at
  1440×900, 1366×768, 1280×660, 390×844 and 844×390 landscape: entire stage +
  grounding + drawer handle visible, zero scrolling.
- **Grounding stays on the stage, never in the drawer.** "Bring me back" is a
  safety control, so it lives permanently top-right as a quiet outlined-danger
  button, and is z-lifted above the drawer scrim so it's one tap away even with
  the drawer open. The spiral-variant chips that used to sit top-right moved
  *into* the drawer ("The pull"), freeing that corner.
- **Voice split: drawer speaks, bar reports.** Inside the open drawer everything
  is Akasha's first person ("I decide what comes next.", "How long before I lower
  you out.") — she's setting the night with you. The collapsed bar is a
  third-person status readout ("She keeps going · drift in 45m · spiral, slow"),
  matching the codebase's existing third-person announcement register (whispers /
  polls / commissions). The brief's illustrative "she lowers you out" became
  first person in-drawer for this reason.
- **Live drift countdown without touching the store.** The store keeps only
  `sleepTimerMin`; PlayerRoot owns the wall-clock deadline. A component-local
  `armedAt` timestamp (set in an effect off `sleepTimerMin`, reset on re-arm) plus
  a 1s tick derives the same countdown for the summary, the group's armed line,
  and a crescent "drift" ember by the scrub bar. It disarms itself when the store
  clears the timer. No store/engine change.
- **Fine-tune stepper arms on step.** Presets (10/20/30/45/60/90) toggle
  `setSleepTimer`; the ±5m stepper (5–180) arms the exact value immediately and
  highlights gold when a non-preset value is armed, with a "Let it run" release to
  disarm — the simplest mapping onto the frozen `setSleepTimer(min|null)` API.
- **Play button shrinks only on very short heights.** `h-[min(4rem,12vh)]` keeps
  the 64px control everywhere except a ≈390px-tall landscape phone (≈47px), where
  it buys the transport clean clearance above the drawer bar. Nothing else changes
  size.
- **`.range-gold` slider utility (globals.css).** The pace + volume sliders are
  restyled as gold hairline tracks with a warm glowing ember thumb (both WebKit +
  Firefox tracks/thumbs, a gold focus ring on the thumb), tokens only. Demoed on
  `/styleguide`. Variant + pace labels moved out of JSX into `copy.ts`
  (`player.drawer.*`, `player.controls.pace`) — closing the last inline-copy gap
  on this surface.

Gate green: typecheck · lint (0 warnings) · **291 tests** (store untouched) ·
build (39/39 pages). Player screenshots in `docs/qa-shots/final/player-*`
replace the old `player-fs*` / `player-queue` set (collapsed + expanded at five
viewports, a reduced-motion pass, a drift-armed pass, and "The pull").

---

## 2026-07-20 — F1 build: subjects bring their own files (private shelf + Sanctum oversight)

A signed-in subject can bring their own audio into a **private** shelf. Their
files are visible/streamable ONLY to the uploader and the goddess — no other
subject may ever learn they exist (D7, absolute). Files run the normal pipeline
(transcribe → organize, tags_only) so they earn a transcript, tags, and a
default cover automatically.

- **The privacy predicate.** One shared helper, `notSomeoneElses(userId | null)`
  in `src/lib/library/queries.ts` — SQL `ownerUserId IS NULL OR ownerUserId =
  <viewer>` (anonymous → `ownerUserId IS NULL`). It is the D7 floor applied to
  every track-read a subject or anon can reach. It is NOT visibility: the D7
  test creates a *published* owned track to prove the predicate (not draft
  status) is what hides it from others.
- **Owner/goddess access is single-track, additive.** `getAccessibleTrack` and
  `getTrackFilePage` gained an owner branch (owner reaches their own upload at
  ANY level/visibility; the goddess via `isGoddess`; every other subject → null,
  a hard 404 before any signed URL is minted). The catalog/list/search paths use
  the exclusion predicate; the single-file paths add owner inclusion. Non-owned
  catalog behaviour is byte-for-byte unchanged.
- **Owned uploads stay out of the catalog by design.** They are always drafts and
  live only on the subject's "Yours" shelf (query `listMyUploads`) and the
  Sanctum "Their files" page — never the public catalog, and (deliberately) never
  the goddess's main Sanctum Library list either, so a catalog action (publish /
  free-sample) can't be applied to a private file.
- **Pipeline, owner-aware.** `organizeTrack` short-circuits for owned tracks: it
  never inserts a `review_queue` row (D7 — their files aren't her catalog to
  curate) and applies tags with tags_only semantics **regardless of the global
  `organize_auto_apply` dial** (triggers/playlists — shared-catalog machinery —
  are skipped). The ready notification is fired from a single choke point
  (`setPipeline` → `ready`) through the disguise-aware push (`sendToDevice`) +
  inbox (`broadcast`): "It's ready for you." No publish/premiere/whisper push
  ever fires for an owned upload (they never publish).
- **Uploads always self-start.** `/api/me/upload` enqueues `transcribe`
  unconditionally (not gated on `auto_pipeline`), because subjects have no manual
  pipeline control — so a brought file always earns at least a transcript + cover
  even if she has the global auto-pipeline off. Chaining to organize still
  follows `auto_pipeline`.
- **Storage footprint.** Added `tracks.sizeBytes` (recorded at ingest) and set
  `tracks.storageKey` (previously written but never persisted) so the Sanctum
  "Their files" page can show per-subject MB and deletion can remove every stored
  object. `deleteUpload` is hard-scoped to personal uploads (refuses a
  null-owner catalog track), so it can never touch the catalog.
- **Schema:** `tracks.ownerUserId` (uuid FK → users.id, ON DELETE CASCADE,
  indexed) + `tracks.sizeBytes`, enum value `track_source.subject_upload`, and
  settings `subject_uploads_enabled` / `subject_upload_max_mb` /
  `subject_upload_max_files`. One generated migration:
  `drizzle/0015_broad_microbe.sql`.

## 2026-07-20 — F3: whispers — anonymous loves + private comments

New reactions under each whisper: a public **love** aggregate and a **private
comment** thread. Built on the existing feed (`src/lib/feed/whispers.ts`), card
(`WhispersFeed.tsx`), Sanctum whispers, and messages send path — player, auth,
push disguise, and F1 untouched.

- **Two tables** (`relationship.ts`, migration `drizzle/0016_fine_susan_delgado.sql`):
  `whisper_loves` (PK `(whisperId, userId)` — one love per subject; both FKs
  cascade) and `whisper_comments` (`id, whisperId, userId, body, createdAt,
  readAt, replyMessageId` — whisper/user FKs cascade, `replyMessageId` → messages
  ON DELETE SET NULL so pruning a message never orphans a comment).
- **The love verb is "surrendered", not "knelt".** BRAND's register offers both,
  but *kneel* is already the whisper-**receipt** gesture (`whisperReceipts`,
  Sanctum "N knelt"). Reusing it for loves would put two different "knelt" counts
  on one card. "surrendered" (bank: *surrender*) is register-true, unambiguous to
  anonymous visitors, and past-tense **number-invariant** — "1 surrendered" and
  "23 surrendered" both read correctly, so the plural helper isn't needed for it
  (it inflects no noun). Key copy (`copy.whispers.loves` / `.comments`): count
  `"{n} surrendered"`, none `"Be the first."`, comment states `"Laid at her
  feet." / "She has seen it." / "She spoke back — it's in your Messages too."`,
  cap refusal `"You've said enough here. I have all of it."`
- **D7 is the spine.** There is deliberately **no "who loved" reader anywhere** —
  only aggregate counts (`loveCountsFor`) and the viewer's OWN set (`lovedSetFor`).
  Comments a subject can reach are always scoped `userId = viewer`
  (`commentsForViewer`); the `*Admin` readers (whole set, named) are called only
  from goddess-gated Sanctum surfaces. The `WhisperCard` payload carries the love
  aggregate + the viewer's own thread and **no comment count** — a subject can
  never perceive another's comment or its existence. `publicWhispers()` returns
  the love count only (`loved:false`, `comments:[]`). All feed reads stay batched
  (grouped count, one loved-set query, one viewer-comments query + join) — no N+1.
- **Her reply reuses the messages path.** `replyToComment` → `getOrCreateThread`
  + `sendGoddessMessage` (which fires the existing disguise-aware "She spoke to
  you." push) then stamps the comment's `replyMessageId` + `readAt`. The whisper
  thread mirrors her words (Voice/italic) with an "also in your Messages" line.
  `sendGoddessMessage` now **returns the new message id** (was void) so the
  comment can link to it; all existing callers ignore the return, unchanged.
- **No push spam to her.** Comment-create fires no `notifyGoddess` (unlike
  wishes) — new comments surface only via the fail-soft nav badge on the Voice ›
  Whispers item (`totalUnreadComments`, new `NavCounts.comments`) and the Today
  "Spoken under your whispers" attention row. Per-whisper Sanctum view marks
  comments read on open (this view still highlights what was new).
- **Guards mirror existing patterns.** Per-subject cap of 10 comments/whisper
  (in-voice refusal); 60s identical-body dedup (the wishes petition pattern);
  love toggle idempotent via PK + `onConflictDoNothing`. Deleting a subject's
  comment is allowed for her (audited) and leaves any reply she already sent in
  their Messages.
- **New primitives on `/styleguide`:** `IconDrop` (the love mark — a candlelit
  gold bead, hollow→filled, deliberately not a heart) and `.love-pulse` (one-shot
  gold bloom on tap, reduced-motion-gated in the global guard). Tokens only.
- **Tests** (`src/lib/feed/social.test.ts`, DB-backed): D7 across loves + comments
  (B can't read A via feed/reader/count; anon sees only the love aggregate; owner
  sees own thread; goddess sees all, named), toggle idempotency, the cap, the 60s
  dedup, and the full reply flow (real thread message + linked + mirrored state).

## 2026-07-20 — F4 build (presence + the install/notifications threshold)

- **`lastSeenAt` already existed; F4 adds only the index.** The `users.last_seen_at`
  column shipped in `0000_init` (M0 data model) but was unused and unindexed.
  F4 wires it up and adds `users_last_seen_idx` — migration `0017_tearful_harpoon.sql`
  is that one index and nothing else. `db:generate` drift check is clean.
- **Presence thresholds (pure, in `src/lib/presence/core.ts`).** Online window
  **2 min** (`PRESENCE_WINDOW_MS`); client polls **60s**; heartbeat server-throttle
  **30s** (skip the write if the last stamp is that recent). A future stamp (clock
  skew) reads as present, mirroring the live-room helper.
- **The heartbeat is role-agnostic; her beats are the signal.** `POST /api/presence`
  refreshes any signed-in caller's `lastSeenAt` — mounted in BOTH the subject shell
  and the Sanctum layout. It is the goddess's beats (Sanctum) that light the band
  for subjects; subjects' beats populate her "In the room". Beats on load, on
  tab-show, and every 60s while visible (never hidden). Keeps beating behind the
  takeover — `PresencePing` is mounted as a sibling of the Jail, above IntakeGuard.
- **D7 on the wire.** `GET /api/presence/goddess` returns a **bare `{online}`** —
  never a timestamp, never a count, never a word about another subject. The room
  view (`/api/sanctum/presence/room`) is goddess-gated (middleware + `withGoddess`)
  and never reachable by a subject.
- **Green is the owner's explicit choice.** New token `--color-presence` (a deep
  candlelit emerald `#2fae86`) + `.glow-presence` / `.presence-lit` (breathing halo,
  steadied under reduced-motion). Reserved for the one "she is here" signal: the
  band, the Whispers tab (mobile + desktop), the arrival overlay. On `/styleguide`.
- **The threshold decision is pure + tested (`src/lib/gate/jail.ts`).** Inputs
  `{isMobile, isStandalone, pushPermission, jailEnabled}` → `{jailed, step}`. Only
  mobile subjects; not-standalone → `install`; standalone + push not granted (and
  supported) → `notifications`; **push "unsupported" (old iOS <16.4) while installed
  → NOT held (fail-open, documented)**. Desktop and the goddess are never held. The
  matrix is the only new test file (per owner's minimize-testing directive).
- **The Gate hands mobile install+notifications to the Jail (guarded).** `SubjectGate`
  gains an optional `jailActive` prop (default false = unchanged). When the threshold
  is on, the Gate stops at consent on **mobile** and the persistent, live `Jail`
  takeover owns install + notifications; **desktop onboarding and the consent flow
  are untouched**. This avoids a soft-then-hard double gate. The Jail **reuses** the
  M2 push-subscribe flow (`subscribeToPush`/`registerDevice`) and disguise choice
  verbatim — no subscription logic is reimplemented. Never says the word for a cell.
- **Live release, no reload.** The Jail re-runs the pure decision on focus,
  visibilitychange, and `(display-mode: standalone)` change, and after the push grant
  — so it flips step→step and releases in place (iOS add-to-home-screen reopened from
  the icon; a return from Settings with push allowed).
- **Cloak sees the room.** `goddess_cloak` hides her from every subject's band while
  she still sees "In the room" (the room query ignores the cloak). Toggled from Today
  (dedicated `toggleCloak`) AND Access (shared `toggleSetting`) — both `logAudit`ed.
  New settings: `presence_enabled` (master, default true), `goddess_cloak` (false),
  `notification_jail_enabled` (true).
- **Sanctum strings stay inline; subject strings are in copy.ts.** "In the room" is
  admin-facing, so its labels are inline like the rest of the Sanctum. The two
  subject-facing lines ("She is here." / the overlay) live in `copy.presence`, and
  the threshold framing in `copy.gate.wall` (firm, never apologetic, never "jail").
- **QA hook, gated to non-production.** The Jail honours `?qaJail=install|notifications|off`
  ONLY when `NODE_ENV !== "production"` (dead-code-eliminated from prod builds), so
  the takeover can be screenshotted without a real uninstalled phone. Shots (mobile,
  her faked online via a direct `last_seen_at` write): `presence-band` (band + emerald
  Whispers nav), `jail-install`, `jail-notifications` in `docs/qa-shots/final/`.

## 2026-07-20 — F5: the Mirror (mantra rite · red attention · terms in purple)

- **You → the Mirror, four movements + terms.** `/(subject)/me` rebuilt into
  light-separated movements (DESIGN §D5), every prior capability kept: **Her hold
  on you** (name/rank/percentile plate + the `OathCard` collar), **Today's
  devotion** (the mantra rite + the chain made visible + the stakes), **What
  you've become** (the display-scale stat band + the Vault), **Between us**
  (Secret mode, its own clear block — never buried), and **Your terms** (the
  purple collapsible) at the very bottom. Ask/petition + rooms kept between.
- **The mantra is a rite, not a checkbox.** `MantraRite` shows the line as faint
  ghost text in the display serif; each character said ignites gold across it
  (pure `litLength`), and on exact completion (`mantraMatches` — case-insensitive,
  whitespace collapsed, trailing punctuation forgiven; internal punctuation still
  counts) the input seals and **her praise blooms in** in the Voice treatment.
  The day's link registers through the **existing** keep — `POST /api/chain/mantra`
  → `keepChain(userId,"mantra")`, once-per-day idempotent — no parallel streak.
  Normalizer is a pure module (`src/lib/chain/mantra.ts`) with the one sanctioned
  test (6 cases). Already-held-today rests sealed with her praise until midnight
  (the chain's own tz convention).
- **Settings keys `mantra_text` + `mantra_praise` supersede `chain_mantra`.** Same
  default line; `mantra_praise` defaults "Good subject." Editable from a new Access
  "Mantra & praise" card (zod-validated, `logAudit`, `setMantraAndPraise`); the
  Mirror always reads the live values. `chain_mantra` retired (its only reader was
  the old `MantraButton`, now replaced).
- **The red attention system (`.burns` + `--color-attention`).** A hot red glow-
  ring on any nav tab that holds something needing the subject: **Whispers** (a
  whisper — or her reply to one of their comments — since last seen), **Tasks**
  (the former lone danger dot, now unified into this one treatment via the same
  `pendingCount`), **Messages** (her unread word). A cheap fail-soft `attentionFor`
  runs once in `SubjectShell` and feeds both navs; `Attention`/`NO_ATTENTION` live
  in `lib/attention/types.ts` so the client navs don't drag the DB into the bundle.
  **Priority:** on Whispers red **overrides** the F4 emerald presence (green shows
  only when nothing burns); a tab's burn is suppressed while it is the active tab.
  Reduced-motion holds a solid red ring (no pulse). **You**-tab praise/collar burn
  skipped — no cheap unseen-marker without another column.
- **Seen mechanisms (one migration).** Whispers had no per-feed "seen" marker
  (receipts only record a kneel), so **added `users.lastSeenWhispersAt`**
  (migration `0018_smiling_masque.sql`), stamped by `POST /api/whispers/seen` from
  a `<WhispersSeen/>` marker on the signed-in Home. Messages reuse `messages.readAt`
  on **goddess-sent** rows to mean "the subject has seen it" (set in `myThread`) —
  no migration, no collision with her inbox (which reads subject-sent readAt).
- **"Your terms" in muted amethyst (`--terms-*`).** A deep-violet collapsible,
  collapsed by default behind one quiet in-voice line, holding the old Settings
  **intact**: quiet hours, limits (themes she must never touch), and the GDPR
  pieces (export + release) — same endpoints (`/api/me` PATCH, `/api/me/export`,
  `/api/me/delete`), now voiced through `copy.terms`. `SettingsClient` deleted.
  *Deviation:* the brief named only GDPR + notification choices for this block;
  the theme **limits** were folded here too (they are literally the subject's
  terms) rather than orphaned. New tokens demoed on `/styleguide`.
- **Settings tab gone.** `/(subject)/settings` now `redirect("/me")` (old deep
  links live); `/settings` dropped from `YOU_ROOMS` and the You rooms grid.
- **Deep-link audit.** Whisper push now anchors to the exact card: threaded an
  optional `whisperId` through the shared `sendWhisperPush` path (immediate +
  scheduled), `deepLink: /#whisper-<id>`, with `id`/`scroll-mt` on `WhisperItem`
  (the SW click handler already preserves anchors via `client.navigate`). Every
  other call site audited and left as-is — each already lands on its exact surface
  (chain-broke/rank/collar/rename/wish → `/me`, her reply → `/messages`, task →
  `/orders`, commission stage → `/commissions`, premiere/new-file/upload-ready →
  `/library/track/<slug>`, poll → `/asks`, gift/delivered → `/library`).
- **Whispers burn ignores audience by design** (a heavier per-subject filter isn't
  worth it) — a rare over-signal clears the instant they open `/`, which is the
  point of the glow. Her comment-reply burns **both** Messages (where it lives) and
  Whispers (where they may look). Shots (mobile 390, jail off, her faked online):
  `you-mirror`, `you-mantra` (mid-type ignition), `nav-burns` (red Tasks beside
  emerald Whispers) in `docs/qa-shots/final/`.

---

## 2026-07-20 — Chunked resumable uploads (defeat the Cloudflare 524)

- **Root cause.** Uploads streamed the whole file through the app in ONE request.
  Behind Cloudflare's orange-cloud proxy (kept for IP hiding) any single request
  over ~100 s is killed with a **524** origin timeout; large audio on a home
  upstream blew past 100 s. Fix: slice the file client-side into small parts,
  each its own short request, reassembled server-side; the final assemble+ingest
  is fast because the bytes are already on disk.
- **Protocol.** Per-chunk raw-body `POST ${endpoint}?uploadId&index&count&filename&size&sha256&durationS[&trackId][&title]`.
  Chunks go **strictly sequentially**. Earlier chunks answer `{received}`; the
  **final chunk** (`index === count-1`) triggers assemble → integrity-check →
  ingest and answers `{trackId}`. Chunk size **5 MiB** (client const) — one part
  finishes well under a minute on a ~1 Mbps upstream and stays under Cloudflare's
  100 s / 100 MB per-request caps. The client `uploadAudio(file, {trackId?,
  durationS?, onProgress?, endpoint?}) → {trackId}` signature is **unchanged**, so
  no caller changed (UploadQueue, AttachButton, bulk AttachClient, F1 YoursShelf).
- **Retry / ordering (the resumability).** Each chunk retries itself up to **3×**
  with small backoff (300 ms × attempt) on a network drop or 5xx; ordering is
  never advanced past a failed chunk. Server keeps a strict guard: reject **409**
  if `index !== received` (chunks committed so far) for that `uploadId`. Index 0
  (re)initialises — it wipes any prior state for that id, so an index-0 retry
  after a lost response starts clean rather than wedging. A mid-append transport
  failure truncates the assembled file back to the last committed boundary and
  answers **500** (retryable) without losing committed chunks.
- **Path safety.** The temp dir is derived from the `uploadId` **uuid alone**
  (`tmpdir/akasha-chunked/<uuid>/`), never from the filename — no traversal
  surface. All query params are zod-validated (`uploadId` uuid, `index<count`,
  `sha256` = 64 hex, etc.).
- **Integrity gate (fail loud, never ingest a mismatch).** The client sends the
  whole file's exact byte `size` + hex `SHA-256` (Web Crypto). On the final chunk
  the server asserts the assembled file's size **and** streamed SHA-256 match
  before it ever calls ingest; a mismatch → **422** + cleanup, no ingest. F1
  speaks it in voice (`copy.uploads.errors.notWhole`, new); the Sanctum is plain.
- **Size + auth enforcement per route.** Auth is re-checked on **every** chunk
  (each chunk is its own POST → the route's `auth()` runs each time): Sanctum
  requires `goddess`, F1 requires a signed-in owner (upload bound to their id).
  Index-0 fast-fails run before any bytes: Sanctum validates the R8 `trackId`
  target (exists → 404, no audio yet → 409); F1 checks `subject_uploads_enabled`
  (403), audio extension (415), and the per-subject file cap (409). The per-file
  ceiling is enforced twice — an **exact** declared-`size` vs `maxBytes` fast-fail
  at index 0, plus a hard streaming cap as bytes accumulate (413 + cleanup). Caps:
  F1 = `subject_upload_max_mb`; Sanctum = 1 GiB origin-side (her own masters).
- **Cleanup.** Temp dir removed on finalize (success) and on any hard error; kept
  between chunks. A best-effort sweep of assemblies older than 6 h runs on each
  new upload start (index 0) to reap abandoned partials.
- **Backward-compat: fully switched (no single-shot path kept).** Every poster to
  these routes is the shared `uploadAudio` client (grep-confirmed: 4 callers, no
  other `fetch`/XHR to `/api/*/upload`), so both routes now speak chunked only —
  simpler than maintaining a dual path. The old whole-body streaming code is gone.
- **Shared server helper** `src/lib/media/chunked.ts` owns transport only
  (assembly, ordering, ceiling, integrity, cleanup) and both routes delegate via
  `onStart`/`onFinalize` hooks — the routes keep their own auth, validations, and
  ingest/attach + `logAudit` + auto_pipeline/transcribe enqueue. **`ingest.ts`
  contracts (`ingestUploadFromPath`, `attachUploadToTrack`) are unchanged** — they
  still receive one assembled path. Pure planning/assembly split into
  `src/lib/media/chunk-plan.ts` (`planChunks`/`concatChunks`), unit-tested
  (`chunk-plan.test.ts`) with a SHA-256 proof that in-order concat is lossless.
- **Minor deviations.** (1) F1's old secondary MIME sniff is dropped: chunk bodies
  don't carry the original file's content-type, so the **extension** allow-list
  (here + in ingest's `ALLOWED_EXT`) is the gate. Net effect for real users is
  identical (the client already filters by `AUDIO_RE`), and it incidentally stops
  a latent false-reject of `.mp4` audio whose browser MIME is `video/mp4`. (2)
  Assembly temp files are **local to the origin** — chunk N must reach the same
  origin as N-1. True for the single-origin-behind-Cloudflare deployment; a
  multi-instance origin (M6 scale) would need shared scratch storage. (3) The
  client hashes the whole file via `file.arrayBuffer()` (one transient in-memory
  copy) — Web Crypto has no streaming digest and no new deps were allowed; chunk
  *sending* stays memory-bounded (lazy `file.slice`), and the server hash streams.

---

## 2026-07-24 — Delete controls for tracks, series & trainings (goddess)

The goddess can now permanently delete her own catalog content from the Sanctum:
catalog **tracks** (Library), **series** (curated playlists) and **trainings**
(programs). New server actions `deleteTrack` (`sanctum/library/actions.ts`),
`deleteSeries` (`sanctum/series/actions.ts`) and `deleteProgram`
(`sanctum/programs/actions.ts`) — each `requireGoddess`, zod-validates its id,
`logAudit`s (`track.deleted` / `series.deleted` / `program.deleted`) and
revalidates. UI is a shared two-tap inline confirm (`sanctum/ConfirmDelete.tsx`,
tokens only, danger tone, **no** browser `confirm()`); copy is hers in
`copy.sanctum.delete`. Track delete removes the audio/artwork from storage
(best-effort, mirroring `deleteUpload`) and prunes durable `jobs` rows carrying
the trackId in their jsonb payload (no FK) before deleting the row. Series /
program delete NEVER touch the underlying tracks — only the collection + its
memberships (`playlistItems` / `programItems` / `programProgress` cascade).

- **SET NULL migration (`drizzle/0019_black_harry_osborn.sql`) — the safety fix.**
  Deleting a `tracks` row must not be blocked by a non-cascade FK. Most refs to
  `tracks.id` are already `ON DELETE CASCADE`; the ones that weren't (nullable, no
  `onDelete` → NO ACTION, which raises 23503) are changed to `ON DELETE SET NULL` —
  semantically a deleted track just *detaches* from the thing that pointed at it,
  which survives:
  - `whispers.audio_track_id` (a whisper's attached track)
  - `wish_clusters.shipped_track_id`
  - `commissions.delivered_track_id`
  - **`user_triggers.acquired_via_track_id`** — NOT in the original brief's list of
    three, but it is a fourth nullable non-cascade FK to `tracks.id`, and it **is**
    populated in practice (`src/lib/listen/record.ts` writes it on qualifying
    completion). Left as NO ACTION, deleting any trigger-installing catalog track
    would fail with an FK violation — exactly the class of bug this SET NULL pass
    exists to prevent. Changed to SET NULL for the same detach-on-delete reason
    (the subject keeps the trigger; only the provenance link is lost). Flagged as a
    deliberate deviation from the brief.
  Verified by a functional test: a track referenced by both a whisper and a
  `user_triggers` row is deleted successfully and both references go NULL (the rows
  survive). A full from-scratch `db:migrate` replay is clean and the drift check
  reports no schema/migration divergence.
- **"Their files" left as-is.** The goddess already has a delete affordance there
  (`deleteTheirFile` → `deleteUpload`, which permits the goddess), so nothing was
  added; F1's owner-scoped `deleteUpload` was not touched.

## 2026-07-24 — Edit AI trigger findings before & after approval (goddess)

The organize/analyze reading proposes triggers, but a proposal is often partial (a
half name, no description, no safety notes). The goddess can now **complete/fix a
trigger before approving it** and **edit any trigger after it's applied**.

- **One trigger-write hub (`src/lib/organize/apply.ts`).** Added `upsertTrigger`
  (find-or-create canonical trigger by slug, returns id), `uniqueTriggerSlug`
  (trigger-scoped uniqueness loop mirroring media `uniqueSlug`, with an
  `excludeId` so a rename that keeps its own slug doesn't self-collide),
  `editTrigger` (rename → fresh unique slug + set description/safetyNotes; logs
  `trigger.edited`), and exported the existing `slugify`. `applyTriggers` was
  refactored to a richer `TriggerToApply[]` (adds optional description/safetyNotes)
  and now routes every trigger through `upsertTrigger` — so the dossier-approve
  and organize-review paths share one create/link/slug core. Dedup is by slug: an
  existing trigger is **linked, not duplicated**; her completed description/safety
  fill only *still-empty* fields (non-destructive — a shared trigger another track
  carries is never clobbered on link). `applyReview` gained an optional
  `TriggerEdit[]` that folds her edits over the proposal (matched by original AI
  name); relation + evidence always stay from the proposal. Fully backward
  compatible — the existing `apply.test.ts` (create + idempotency) passes
  untouched.

- **Edit BEFORE approving.** On the dossier (`DossierClient` → `TriggerFinding`)
  each un-applied found trigger renders editable name (required) / description /
  safety-notes pre-filled with the reading's values (description empty where it was
  silent; safety pre-filled from `suggestedSafetyNotes`), evidence phrase read-only
  for context. `approveTriggerAction` now zod-parses `originalName` (the ledger
  key) + her edited `name`/`description`/`safetyNotes` and `approveTrigger`
  materialises from HER values. On rename it **syncs the ledger finding's name** to
  the approved name (`setTriggerApproved`) so the dossier's "on the track" match
  (finding-name vs applied-trigger-name) still holds and a re-run won't re-propose
  it as new. The organize review queue got the same treatment via a new client
  `ReviewCard` (tags/playlists stay read-only — tag approval not regressed;
  triggers editable) posting `editedTriggers` JSON to the extended
  `approveReviewAction`. Dismiss/reject unchanged.

- **Edit AFTER approving.** New `editTriggerAction` (requireGoddess, zod: triggerId
  uuid, name 1..200, description/safety optional) → `editTrigger`. The dossier
  shows a quiet **"Refine"** inline form on every applied trigger (both those that
  match a finding and a new "Already bound to this recording" list for triggers the
  current reading didn't re-surface), pre-filled from the canonical row, with copy
  noting a trigger is **shared** — refining it here reshapes it on every track that
  carries it (intended, F5). Optimistic `router.refresh()` after save. The dossier
  page now passes full applied-trigger rows (`{id,name,description,safetyNotes}`,
  deduped by id) instead of just lowercased names.

- **Copy.** All new strings live in `copy.sanctum.triggers` (in her voice, no
  app-speak); the previously-inlined dossier "Triggers" heading/blurb/badges were
  moved there too. **Scope note:** tag *value* editing was deliberately NOT added
  (only "don't regress tag approval" was required) to keep the tag `kind+value`
  dedup surface untouched. Verified: typecheck + lint + build all green.

## 2026-07-24 — Anonymous barrier audit + discreet-first notifications gate

- **Anonymous barrier: audited end-to-end, no server-side hole.** Enumerated every
  entry point reachable without a session — all 43 route handlers under
  `src/app/api/**`, all 22 `"use server"` files, and every gated page — and
  confirmed each checks the session **in the handler/action itself**, not merely
  behind the middleware pathname gate (Server Actions dispatch by action id and
  can be POSTed at any path, so a pathname gate is never their guard). Full
  route-by-route checklist in `docs/QA-REAUDIT.md` §"Anonymous barrier audit".
  Five endpoints are unauthenticated **by design**, each with its own proof:
  `/api/auth/*` (NextAuth), `/api/health` (no data), `/api/push/vapid-key` (a
  *public* key), `/api/stream` (expiry-checked HMAC, `timingSafeEqual`), and
  `/api/tracks/:id/stream-url` (falls to `getSampleTrack`, which demands
  published + `freeSample` + no `ownerUserId`, and returns 404 **before**
  `signStreamUrl` is ever called). No new test was added because no server-side
  hole was found — the one fix below is presentational.

- **Fixed (UI): the file page's "After this" rail showed locked files as open to
  logged-out visitors.** It sealed on `!t.unlocked` alone, but `unlocked` is a
  pure *level* test and an anonymous viewer resolves to level 0 — so every
  `minAccessLevel = 0` track rendered undimmed and unsealed in the rail, while
  the catalog grid and the page's own CTA on the same screen correctly read it as
  `anon` → locked. Now `railSealed = !t.freeSample && (!signedIn || !t.unlocked)`,
  matching `LibraryClient`. The server always refused those tracks; this only
  closes the contradiction on screen.

- **The threshold's notifications step now plays in two beats (F4 + R6).**
  Previously one panel carried both the disguise switch and the "allow
  notifications" button, so the browser permission prompt could be answered
  before the subject had understood — or even noticed — the discreet option.
  Restructured into an explicit order inside the same `"notifications"` step:
  1. **Beat 1 (before any permission prompt)** — she asks how she should appear on
     the lock screen, explains plainly what discreet mode does (an ordinary,
     family-safe app: neutral title, neutral grey icon, nothing about her or the
     content), shows the existing true-vs-masked `NotificationPreview` pair
     (`DISGUISE_MESSAGES[0]`, reused verbatim from the You card), states that it
     can be turned either way at any time from **You → Discretion**, and offers
     two equal choices — *"Keep it discreet"* / *"Show her plainly"*. Both persist
     through the existing `setDisguiseMode` server action (`requireSubject`, zod,
     audited), so an explicit "plainly" is recorded rather than left to default.
  2. **Beat 2 (only after that choice)** — the real `subscribeToPush` flow, opening
     by confirming the choice they just made and carrying a new line making the
     demand plain at the moment of the prompt.
  The switch/toggle affordance is gone from the threshold (two buttons make the
  choice unavoidable rather than skippable); the M2 `SubjectGate` desktop path
  keeps its original single-panel toggle untouched.

- **The pure `jail()` contract is unchanged** — still `install | notifications |
  free`, `src/lib/gate/jail.ts` untouched and its 7 tests still pass. The two
  beats are local component state (`disguise: boolean | null`, `null` = unanswered),
  which also means the QA-only `?qaJail=notifications` hook still lands on beat 1
  and walks to beat 2, reduced-motion behaviour is untouched, the iOS-vs-Android
  install instructions are untouched, and desktop + the goddess are still never held.

- **Copy.** New keys under `copy.gate.wall`: `discreetTitle`, `discreetBody`,
  `discreetAnytime`, `discreetYes`, `discreetNo`, `discreetChoseMask`,
  `discreetChosePlain`, `notifRequired`. Preview labels are reused from
  `copy.secret.*` verbatim rather than duplicated. Also added `copy.secret.anytime`
  and rendered it in `SecretModeCard` so the You tab states the reversibility
  explicitly beside the switch (F5) instead of only implying it.

## 2026-07-25 — Pre-launch security audit + fixes

Full read-and-report audit written to `docs/SECURITY-AUDIT.md` (verdict: GO WITH
CAVEATS). Seven vulnerabilities were fixed in the same commit; the rest are
recorded there as RECOMMENDED / ACCEPTED-RISK rather than changed, because they
need a product decision or a version bump.

- **Storage keys are no longer caller-shaped.** A subject's upload filename fed
  straight into `originals/<trackId>/<filename>`, so `../../stream/<id>.mp3`
  addressed any other object — overwrite on upload, and delete via the F1
  "take it back" path. `safeStorageName()` in `src/lib/media/ingest.ts` reduces
  a filename to a bare basename before it can ever address an object, and the
  local provider now proves containment with `relative()` instead of a
  `startsWith(ROOT)` prefix test (which a sibling `…/media-x` directory passed).
- **Production refuses the development `AUTH_SECRET`.** It signs both the
  session JWT and the media stream tokens, so the published fallback was a
  goddess-session forgery waiting for one missing env var. `src/lib/env.ts` now
  fails the boot in production on the default, or on anything under 32 chars.
- **Three client-chosen ids are now owner-scoped:** `deviceId` (read *and* the
  upsert), the listen `sessionId` (both reads plus the heartbeat upsert), and
  the chunked-upload `uploadId` (recorded in the assembly's meta and re-checked
  on every chunk). Each was reachable only by guessing a UUID, but each crossed
  the subject boundary — the device read leaked another subject's existence
  outright (D7).
- **`withSubject` stopped echoing raw errors.** A driver or filesystem message
  could carry table names or paths; it goes to the server log now and the
  subject gets `request_failed`. `withGoddess` still surfaces the real message —
  that surface is hers alone and she needs it to debug.
- **Deviation noted, not changed:** PLAN §"Never expose" forbids showing
  subjects *counts* of each other, but whisper loves ("{n} surrendered"), poll
  tallies, and the obedience percentile all do. Left in place — removing visible
  features is her call, not an auditor's — and written up as S-08 with the exact
  render sites.

## 2026-07-25 — Anonymous visitors may taste, and may ask

Two doors opened for someone with no account, without loosening a single
entitlement.

### 1 · Free samples actually play for the logged-out

- **The server was never the blocker.** `getSampleTrack` already returns exactly
  "published + `freeSample` + real audio + not a personal upload", and
  `/api/tracks/[id]/stream-url` already falls through to it when the caller has
  no session; `/api/stream` only ever trusted its own HMAC. Verified live
  end-to-end while logged out: card play → signed URL (200) → audio bytes (200),
  with a non-sample still refused (404). The catalog grid and the file page
  already offered the control too. Nothing there was changed.
- **The real gap was the series list.** `SeriesClient` decided everything on
  `signedIn && t.unlocked` alone, so inside a published series a free sample wore
  a padlock and an "Enter with Patreon" button — contradicting the same track's
  own card and file page. It now plays for the unentitled and the logged-out,
  with the "A taste. Free." line beside it. A premiere still seals it (R9.6), and
  the sample plays ALONE — never inside the named series queue, so the taste ends
  into the upsell instead of rolling on into files nobody has earned.
- **Discovery: one shelf, not scattered badges.** `SampleShelf` ("Taste her")
  sits above the sealed grid for logged-out visitors only, in the same larger-art
  D5 shelf treatment as "Where I left you". Hidden under an active search, where
  a shelf of unrelated open files reads as noise. Backed by `listFreeSamples()`,
  which returns precisely the set the stream endpoint will serve and drops
  still-future premieres — a shelf whose whole promise is "this one plays" must
  never offer a dead tap.
- **Copy corrected, deliberately.** `library.publicIntro` promised "only the
  claimed may play", which has been untrue since R9.8. It now says a few are left
  open. Telemetry stays subject-only: `PlayerRoot` already skips every listen
  endpoint for the anonymous, and no listen is recorded for a sample.

### 2 · Guest commissions (`commissions.userId` is now NULLABLE)

- **Schema.** `user_id` drops NOT NULL (FK + cascade kept, so releasing an
  account still takes its commissions with it); `guest_email` and `guest_name`
  added, both nullable. Migration `drizzle/0020_boring_patch.sql`.
- **THE INVARIANT, and why it is code and not a CHECK.** Every row must carry
  EITHER `userId` OR `guestEmail` — a row with neither is unanswerable,
  undeliverable and invisible. Drizzle has no portable CHECK-constraint helper at
  this version, so `assertCommissionIdentity()` in `src/lib/commissions/ops.ts`
  **is** the constraint, and every insert path calls it (subject submit, guest
  submit, tests). This is a documented deviation from "constraints belong in the
  database": if a raw insert ever bypasses the ops layer, nothing stops it.
- **Routing.** `/commissions` left `subjectPrefixes` in `auth.config.ts`. The
  pathname gate was never the protection — the page renders an anonymous variant
  and `POST /api/commissions` carries its own guards. Signed-in behaviour is
  untouched: their progress cards, their one-at-a-time rule, no email field.
- **Same state machine, no bypass.** A guest hits the identical open/sealed
  machine: sealed still means the waitlist petition only (with an address, so she
  can call them), never the field form, and `submitGuestCommission` writes
  `waitlist: !open`. "One at a time" is deliberately NOT applied — it keys off an
  account a guest does not have; the throttle stands in its place.
- **Validation.** Body capped at 32 KB *before* `JSON.parse` (S-10 flagged
  `req.json()` parsing an unbounded body before zod saw it); answers are now
  `z.record(key ≤ 64 chars, value ≤ 4000 chars)` with at most 40 fields, instead
  of the old unbounded `z.record(z.string(), z.unknown())`; guest email is a real
  email ≤ 200 chars, name ≤ 100.

- **THROTTLE — and its limitation, stated plainly.** `src/lib/commissions/
  throttle.ts`: at most **3 accepted submissions per IP per hour**, and an
  identical (email + answers) inside **10 minutes** is accepted to their face and
  never stored, so a double-tapped button cannot make her two rows. Duplicates
  are checked first and cost no quota. Refusal is a 429 rendered as
  `copy.comm.guest.tooMany`, never a stack trace.
  **The state is a plain Map in ONE process.** A second web container, or a
  restart, starts from zero, and a caller who rotates IP addresses is not slowed
  at all. This is a partial mitigation of S-10 for one new public endpoint — it
  raises the cost of casual flooding and kills accidental duplicates. It is not a
  rate limiter, and it does not close S-10, which still wants a shared store.
- **Every null-user path is guarded.** `setCommissionStage` advances the stage but
  sends no push; `deliverCommission` refuses outright (a delivery is a GRANT
  against a user row — there is no library to put the file in);
  `notifyWaitlistReopened` excludes null userIds in SQL and again in the map. No
  code path can now push or message a null user.
- **Sanctum.** The board's `innerJoin(users)` became a `leftJoin` — an inner join
  would have hidden guest requests from her entirely. A guest row is labelled
  "no account yet", shows the reply address as a `mailto:` beside the same
  accept / decline / stage controls, replaces the Deliver form with the reason it
  cannot run, and notes that the stage is tracked for her eyes only.
- **D7 holds.** A guest row has a NULL `userId`, and NULL never equals a uuid, so
  `getUserCommissions` and `hasActiveCommission` exclude it without a special
  case. No subject-facing list or count can perceive that a stranger asked her.
  Covered by the one new test, `src/lib/commissions/guest.test.ts`.
- **Not built (noted for later):** a guest who later connects with Patreon is not
  automatically linked to their earlier request by email. She re-asks them, or it
  is matched by hand.

---

## 2026-07-26 — First-party visitor analytics + the Sanctum dashboard (A21)

She had a Sanctum "Analytics" page that could answer two questions (top tracks,
who listened today) and nothing about the thing she actually needs to know:
whether anyone is finding this place, and what happens to them when they do.
That is normally bought from Google, which is exactly what this project cannot
do — so it is built here, first-party, end to end.

### 1 · Privacy stance (this is the design, not a footnote)

- **No third party, ever.** Nothing calls out. The CSP (`next.config.ts`) would
  refuse the request anyway; this is one `INSERT` into her own Postgres.
- **No IP address is stored, in any form** — not raw, not hashed, not truncated.
  The IP is read once inside `POST /api/track` as a throttle bucket key and is
  gone when the request ends.
- **No raw user-agent is stored.** It is bucketed to `mobile|tablet|desktop`
  (`deviceFromUa`) while the request is in memory; the string is dropped.
- **No full referrer URL.** `normalizeReferrerHost` reduces whatever arrives to a
  bare hostname, and *refuses* anything it cannot parse as one — so a Reddit
  thread title or a search query can never land in the table.
- **No query strings, ever**, and no free-form paths (see normalization below).
- **Do Not Track is honoured at the source**, client-side, before anything is
  sent — so an opted-out visitor generates no row to have to delete later.
- **Her own browsing is not counted.** The root layout passes
  `enabled={!isGoddess}`; her movements are not a funnel.
- `visitorId` is a random uuid minted server-side into an httpOnly, Lax,
  Secure-in-production `oa_vid` cookie (~180 days). It identifies a browser, is
  derived from nothing about the caller, and is never joined to identity except
  through `userId`, which the visitor supplied by signing in. httpOnly rather
  than the readable cookie the brief allowed: nothing client-side needs to read
  it, and `sendBeacon` carries cookies on same-origin requests regardless.

### 2 · Path normalization is an ALLOWLIST, not a sanitiser

`normalizePath` (`src/lib/analytics/core.ts`, the tested file) maps a pathname to
a route PATTERN from a fixed list — `/library/track/[slug]`, `/messages/[id]`,
the entire Sanctum collapsed to one `/sanctum` marker — and anything it does not
recognise collapses to its first segment (`/newthing/*`) or to `/other`. Query
strings and fragments are cut first. `/api/**`, `/_next/**`, icons, art and
anything ending in a dotted suffix are refused outright (return `null`, no row).

This is deliberately stricter than "strip the ids": a sanitiser has to be right
about every URL that will ever exist, whereas an allowlist is wrong in the safe
direction. It is also what makes "top pages" aggregate into something readable
instead of ten thousand one-view slugs. The two patterns the funnel counts on
are exported as `PATH_FILE`/`PATH_GATE` and bound into the SQL, so a rename here
cannot silently zero the funnel there.

### 3 · Dwell: two calls, one row, monotonic

The simpler of the two designs offered. The first call inserts the view and
returns its row id; the client holds that id and, on every hide / unload / route
change, beacons `{ viewId, dwellMs }` with its running total of **visible**
milliseconds. The server folds it in with `GREATEST(COALESCE(dwell_ms,0), $1)`
after clamping to 6h.

Why this and not "insert the dwell on exit": an exit-only insert loses the view
entirely whenever the exit beacon does not fire, and cannot tell a bounce from a
crash. Why `GREATEST` and not write-once: tabbing away and coming back would
otherwise freeze the number at the first hide. The id in the client's hands is a
random uuid whose only power is to refine one dwell figure upward to a clamp —
there is no unbounded write behind it. `sendBeacon` cannot read a response,
which is exactly why the insert is an ordinary `fetch` and the dwell is the
beacon.

### 4 · Abuse

`src/lib/analytics/throttle.ts`, mirroring `src/lib/commissions/throttle.ts`:
**60 events per visitor per minute** and **300 per IP per minute** (the IP bucket
is spent first, so dropping the cookie to get a fresh visitor bucket does not
buy anything). Body capped at **1 KB before `JSON.parse` runs**, zod after that.
Same stated limitation as the commissions throttle: it is a Map in ONE process,
so a restart or a second container starts from zero and a caller rotating IPs is
not stopped. It bounds casual flooding; it does not close S-10.

### 5 · Retention, export, erasure

- **Retention:** `analytics_retention_days` (default **400** — a year-on-year
  comparison and nothing more) in `SETTINGS_DEFAULTS`; the worker's new daily
  `analyticsRetentionTick` deletes older rows in SQL against the `created_at`
  index. Floor of 1 day so a bad value cannot mean "keep forever".
- **Export:** `exportUserData` now returns a `pageViews` array (path, referrer
  host, device, dwell, timestamp) for rows carrying their `userId`.
- **Erasure:** the FK is `ON DELETE SET NULL` (traffic history survives a release
  as anonymous rows), so `POST /api/me/delete` deletes that subject's rows
  **outright and first**, while the id is still there to find them by. Verified:
  65 linked rows removed, the 195 anonymous ones untouched, user row gone.
- **Privacy policy:** a new plain-language paragraph on `/privacy` says what is
  stored, what is not (IP), that it is first-party only, the ~1 year window, the
  DNT opt-out, and that deletion takes it. Written inline in that page like every
  other paragraph there — a deviation from "copy lives in `copy.ts`", matching
  the file's existing convention rather than splitting one policy across two
  files.

### 6 · The dashboard (`/sanctum/analytics`, rebuilt)

Server-rendered, `requireGoddess()` on top of the layout and middleware gates,
range via `?range=7d|30d|90d|all` (default 30d). Five sections: **Who came**
(visits, unique visitors, signed-in share, median time on site, a CSS-only
per-day bar row, top 10 pages with average dwell, referrer hosts, device split);
**From stranger to claimed**; **How deep they went** (hours, plays, completion,
top tracks, and drop-off); **Hers**; **What they asked for**. Every query is
wrapped like `navCounts` — a broken one renders a dash, never a 500 (proven: the
first run had a driver bug in every dated query and the page still rendered).
All aggregation is SQL against indexed columns; the largest result any query
returns is a top-10 list. No chart library, no new dependency, tokens only.

**Drop reports are surfaced for the first time.** They have been collected since
M1 and shown nowhere. The table now reads the count, the average self-reported
depth (1–5), and — by joining the listen session the report belongs to — where
the listener had actually reached when they fell out, as `mm:ss` and as a share
of the track. That last figure is the real "worst drop point".

### 7 · What the funnel can and cannot know, said out loud

Visitors → opened a file → played a free sample → reached the gate → claimed an
account → entitled now. Four of those six come straight from `page_views`,
`users` and `entitlements`.

**"Played a free sample" cannot be complete, and the page says so on the page
rather than inventing a number.** `listen_sessions.user_id` is NOT NULL and
`PlayerRoot` deliberately skips every listen endpoint when logged out (R9.8), so
an anonymous sample play leaves no record anywhere in this system. The row shows
the signed-in figure with a one-line explanation and no conversion percentage,
since it sits on a different base from the steps around it. Closing that gap
would mean recording anonymous playback, which is a product decision about
telemetry, not a dashboard bug — noted here, not quietly patched.

"Entitled now" likewise shows no percentage: it is a state, not a period.

### 8 · Not done, on purpose

- `/api/track` is left inside the middleware matcher (it costs one edge auth
  check per beacon) rather than editing `middleware.ts` for a measurement route.
- The legacy `analytics_events` table is untouched; nothing new writes to it.
- The dashboard's `Stat` / `Table` / `Tally` / funnel-row pieces are local to the
  page, built from existing primitives, so `/styleguide` gains nothing new —
  same pattern as the other Sanctum surfaces (`RoomPanel`, `LivePanel`).

---

## R-DEADENDS · The feed, the composer, and delivery truth (2026-07-27)

The brief was "find the dead ends", so each entry below names the dead end
first and the change second.

### 1 · A whisper could only be words or a poll

`whispers` already carried `image_key` and `audio_track_id` columns from M4-B;
nothing ever wrote to them. The composer now does, and the feed renders both.
Attaching a track needed one decision PLAN did not settle: what a subject who
may NOT hear that track sees on the card.

**Chosen: resolve playability server-side against the same rule
`/api/tracks/[id]/stream-url` enforces, and render a sealed row for the rest.**
The alternatives were worse. Hiding the attachment entirely loses the pull that
makes an attached track worth posting; showing a play button that 404s is a lie
the UI tells once per card. `audioViewsFor()` (src/lib/feed/whispers.ts)
duplicates the gate's logic — published, has a stream key, not a personal
upload, not premiere-sealed, then free-sample OR level — and that duplication is
deliberate: the feed must decide without issuing a signed URL. If the stream
gate's rule changes, this must change with it.

Only the live catalog is offered in the picker (`published_at` not null,
`owner_user_id` null), so a subject's private upload can never be attached to a
whisper — D7 holds by construction rather than by review.

### 2 · Every whisper woke everyone

`sendWhisperPush` fired unconditionally on publish. A "post without waking them"
switch skips it. Deliberately NOT a new column: silence is a property of the
send, not of the whisper, so nothing about the stored row changes and the
scheduled-publish path (which has no composer) is untouched.

### 3 · "Sent" was the only word the platform had

`notification_deliveries.status` recorded whether the push SERVICE accepted the
message. Nothing recorded whether a phone ever drew it. Every "did he get it?"
was unanswerable.

**Added `delivered_at` + `opened_at` (0023), stamped by the service worker
through `/api/push/ack`.** Two columns rather than new `delivery_status` enum
values on purpose: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
block, and this project's migrations do. Timestamps also answer "when", which an
enum cannot.

The ack route is same-origin and credentialed and scopes every write to
`session.user.id`, so a caller can only stamp their own rows. No session → it
returns `{recorded:false}` rather than an error, because a notification can be
drawn on a device whose cookie has since expired and the SW must not retry.

A push that is accepted but never delivered is now a visible, meaningful state
(phone off, OS-level mute, stale subscription) — shown as "never landed", in
danger tone, rather than hidden inside a success count.

### 4 · Her messages had a read receipt but no delivery receipt

`messages.push_notification_id` (0024) binds a reply to the push it fired, so a
thread shows both facts side by side. They are genuinely different: a subject
can open the app and read her words having never seen the notification, and a
notification can sit unopened on a locked screen. Neither implies the other, so
neither is derived from the other.

### 5 · The Sanctum's read-through let her skew her own numbers

`/sanctum/whispers` rendered the subject card verbatim, offering her Kneel, a
love toggle and a vote on her own poll. `preview` mode keeps the card identical
and removes exactly those three affordances.

### 6 · Names were text

Commissions, ritual answers, their-files groups and the message inbox now open
the person; a profile links out to their conversation, asks, commissions and
files; analytics track and drop-off rows open the dossier. The inbox row needed
restructuring rather than a nested link — an `<a>` inside an `<a>` is invalid
HTML and the browser silently drops the inner one.

### 7 · Not done, on purpose

- The Broadcast page stays separate from the whisper composer. A broadcast is a
  push with no feed card; folding it in would have made "post" and "notify"
  the same control, which they are not.
- No backfill of `delivered_at` for past notifications. There is no honest value
  to write — those pushes were never observed landing, and stamping them now
  would manufacture data.

---

## R-NOTIF · Why nobody was getting notifications (2026-07-27)

### 1 · The bug

`POST /api/devices` upserted with `pushSubscription: d.pushSubscription ?? null`
— unconditionally, on every call.

`SubjectGate` calls that route on EVERY mount, with `pushSubscription: null`,
because a page load has no subscription to hand. `proceedPastInstall()` did the
same and additionally forced `pushEnabled: false`.

So: a subject enabled notifications, the subscription was stored, and their very
next page load erased it. `targetsForUsers` requires a non-null subscription, so
from that moment every send skipped them — recorded as `skippedNoDevice`, which
nothing surfaced. The app believed the membership was reachable; it was not.
This is the whole of "no member tells me he receives notification".

**Fix: a registration only ever writes what it carries.** A subscription is
written when one is supplied, and erased ONLY on an explicit `clearPush: true`
or when the push service itself returns 404/410 (already handled in
`sendToDevice`). `registerDevice`'s param is now optional rather than `| null`,
so the shape of the call no longer invites the mistake, and
`src/lib/push/registration.test.ts` pins the rule — including a case named for
the exact regression.

A revoked OS permission now sets `pushEnabled: false` but KEEPS the
subscription: permission can come back, and healing it is then silent.

### 2 · Proof replaces permission

`Notification.permission === "granted"` was the only evidence the gate ever had,
and it is worthless. It stays "granted" through a wiped subscription, a dead
endpoint, an OS-level mute, and a dropped registration — every failure mode of
the outage above looked identical to a working device.

So the gate now demands **observed delivery**: the server sends one real push
carrying a one-shot token, the service worker echoes that token back after the
notification is actually drawn, and only that stamps `devices.push_verified_at`.
The token IS the credential on the echo (`PUT /api/push/verify` takes no
session) because a service worker's fetch may run with an expired cookie; it is
a fresh UUID, stored on exactly one row, burned on use, and useless to anyone
not already receiving that device's pushes.

The proving push is deliberately visible and in her voice, for two reasons: a
`userVisibleOnly` subscription obliges the worker to show something, and the
subject seeing it work is better than being told it works. It goes through
`sendToDevice` like everything else, so Secret mode disguises it — the disguise
rewrite touches only title/body/icon, leaving `verifyToken` intact.

### 3 · The re-proof demand

`push_reverify_since` (a dynamic setting) is a line in time: any device whose
last proof predates it owes a new one and is held at the threshold until it
delivers. Her Notifications tab sets it to "now" with one button — the recovery
lever for a silent outage that devices cannot detect on their own.

`jail()` gained `proofOwed`, checked LAST (you cannot prove delivery to a device
that hasn't allowed it yet) and applied on EVERY platform including desktop —
unlike the install/permission threshold, which stays mobile-only. It is also
independent of `automations_enabled` and of the threshold setting: turning the
mobile threshold off does not mean she stopped needing to reach people.

**A device that physically cannot carry push is never asked to prove it.**
That check runs before everything, so iOS < 16.4 fails open exactly as before.

**Known risk, stated rather than silently softened:** a subject who has *denied*
notifications at the browser level cannot be re-prompted by script, so on
desktop they are held until they fix it in browser settings. That is the
hard requirement as asked for. It is mitigated with per-platform instructions on
the failure panel rather than by weakening the demand.

### 4 · Automations became rows

They were hard-coded blocks in the worker: she could kill all of them with one
setting, could not read what any of them said, and could not add one without a
deploy. Each is now a row she owns — label, title, body, deep link, audience,
quiet-hours respect, on/off, and the trigger's tuning.

What is NOT hers to invent is the `trigger`, because the worker can only fire on
conditions it has code to detect. `src/lib/automations/triggers.ts` is the
honest catalogue, and the editor prints each trigger's firing rule underneath
the picker instead of offering a free-text field that would never fire.

The catalogue is a separate PURE module from `run.ts` specifically so the client
editor can import it without pulling `web-push` (and thus `net`/`tls`) into the
browser bundle — the build fails loudly if that boundary is crossed.

Three details worth keeping:
- Every trigger uses a ONE-DAY window ("went quiet 5 days ago"), never an open
  comparison ("quiet for more than 5 days"), or it would re-fire every hour for
  the rest of that subject's life.
- `lapse` fires on entitlement status `frozen`. There is no `lapsed` value in
  the enum; the first draft used one and would have matched nothing, forever.
- Both switches in the editor post through hidden inputs. An unchecked checkbox
  sends NOTHING, so a bare checkbox cannot express "no" — "hold it during their
  quiet hours" would have been impossible to turn off, silently.

`automations_enabled` is kept as the master kill switch above all rows, and the
two former hard-coded automations are seeded as rows **off**, so shipping this
starts no pings.

### 5 · Not done, on purpose

- No backfill of `push_verified_at`. Nothing was ever observed landing, and
  stamping it now would assert exactly the thing that turned out to be false.
- `PushHeal` still repairs a subscription silently but does NOT mark a device
  proved. Repair is not evidence.

---

## R-FRESH · Why the app felt slow to update (2026-07-27)

### 1 · What it actually was — measured, not guessed

Before changing anything, the plausible causes were ruled out one at a time:

- **CDN caching HTML?** No. `cf-cache-status: DYNAMIC`, and the origin sends
  `cache-control: private, no-cache, no-store`.
- **Service worker serving stale pages?** No. Navigations are network-first with
  a cache fallback only on failure.
- **Server too slow?** No. Production TTFB measured 0.29–0.68s.

The two real causes:

1. **The Sanctum had no auto-refresh at all.** `LiveRefresh` was mounted only in
   `SubjectShell`. She works almost entirely in the Sanctum, so from her seat
   *nothing ever updated* — messages, asks and commissions piled up behind a
   screen that only moved when she reloaded it by hand.
2. **The subject side re-ran the WHOLE route every 30 seconds**, whether or not
   anything had changed.

### 2 · Why the obvious fix was wrong

"Poll faster" does not work here. Each tick was a full `router.refresh()`: every
server component and every query on that route re-executed. `/library` is 178 KB
of HTML and ~0.6s of server work. Running that every 5 seconds per open tab
would have traded a UI problem for a server problem.

### 3 · What was built instead

`GET /api/pulse` returns an opaque change token — one round trip of indexed
`max()`s, an 11-byte body, ~19ms measured end to end including HTTP. The client
polls that every 5s and calls `router.refresh()` **only when the token changes**.

Net effect per idle user per minute: 12 near-free polls plus one safety refresh
every two minutes, versus two full route re-renders before. Faster to notice
(≤5s instead of ≤30s) AND less server work than what it replaced.

Verified by publishing a whisper straight into the database and watching the
token change, then deleting it and watching it change back.

Details that matter:

- **Role-aware, and D7-safe.** The goddess waits on different things (a message,
  an ask, a commission, a comment, the transcription pipeline) than a subject
  (a whisper, her reply, a task, whether she's online). Every value a subject's
  token is built from is either global or their own — never another subject's
  anything. The response is a digest, so even the shape leaks nothing.
- **Excluded from the middleware matcher.** It is polled constantly and gates
  nothing by pathname — it reads its own session. Edge auth on it would be a
  check per poll for no protection.
- **A `fallbackMs` full refresh every 2 minutes stays**, deliberately. The pulse
  cannot know about everything; without the belt, anything it does not cover
  would go from "stale for 30s" to "stale forever", which is worse and much
  harder to notice.
- **The first poll only sets a baseline** and never refreshes — otherwise every
  page load would double-render for nothing.
- **In-flight guard**: a slow network must not stack polls on top of each other.

### 4 · Not done, on purpose

- `/library` ships 178 KB of HTML. That is a page-weight question, not an
  update-latency one, and is left for a separate pass rather than bundled into
  a fix for something else.
- No websockets / SSE. A persistent connection per subject is a real operational
  cost on one small VPS, and a 5-second token poll is indistinguishable from
  live at this scale.
- The 60s settings cache is untouched: writes update the cache in-process, so
  only the separate worker can be briefly stale, and nothing subject-facing
  depends on that.

---

## R-GATE2 · A laptop is never a wall (2026-07-27)

### 1 · Desktop stops being obligatory

The re-proof demand shipped applying to every platform, desktop included. That
was wrong for one concrete reason: **a browser that has already denied
notifications cannot be re-prompted from script.** On a phone the wall is fair —
you can walk someone into Settings and back out again. On a laptop it is a
lockout with no route back, and the person it traps is a paying member.

So `jail()` now holds PHONES only, for everything: install, permission, and
proof. `DesktopInvite` replaces it there — a dismissible card that asks once,
takes "Not now" for an answer, and remembers the refusal on that machine. It
still proves delivery if they accept, because "allowed" was never evidence.

It also refuses to appear when `Notification.permission === "denied"`: the
prompt cannot be raised again, so offering the button would waste their time and
make her look broken.

### 2 · Her per-subject release

`users.gate_phone` and `users.gate_desktop` (0026), both default true.

- **phone off** — never held at the threshold on a phone. No install demand, no
  notification demand, no re-proof.
- **desktop off** — never even invited on a laptop.

Deliberately named for what they control: whether the app *demands*, not whether
it *sends*. A released subject still receives everything she sends and can still
turn notifications on themselves — the Sanctum card says exactly that, because
"disable notifications for this person" and "stop requiring notifications of
this person" are very different things to confuse in a hurry.

`jail()` takes one `exempt` boolean rather than both flags: the component picks
which flag applies from the device it is actually running on, so the pure
decision stays about one device at a time and cannot mix them up.

### 3 · Not done, on purpose

- No global "require on desktop" setting. Desktop cannot be a wall safely, so
  offering the switch would be offering a footgun; the per-subject desktop flag
  only silences the ask.
- The dismissal is per machine (localStorage), not per account. Saying "not now"
  on a work laptop should not also silence it on a home one.

---

## R-ACCESS · Paying members were locked out, and nothing could notice (2026-07-27)

### 1 · The bug

`syncPatreonUser` — the ONLY thing that ever writes an entitlement — is called
from exactly one place: `src/auth.ts`, on sign-in.

So a member who re-pledged on Patreon stayed `frozen` here indefinitely. Their
session cookie was still valid, so they never signed in again, so nothing ever
re-checked. They had paid and were still sealed out, and no part of the product
was capable of discovering that. It could only be fixed by the member happening
to sign fully out and back in, which nobody does.

**Fix: `reconcilePatreon()`, hourly in the worker.** It reads the campaign
roster with HER creator token rather than each subject's own token, which is
what makes it work for people who never return to the app and avoids refreshing
dozens of expiring per-user tokens. Only rows whose status or tiers actually
moved get an entitlement write; everything else just gets `lastSyncedAt`
stamped, so "when did we last look" stays honest without pointless churn.

`reconcileOne(userId)` is the same source of truth, immediate, for the button on
a subject's profile — nobody should wait an hour for what they already paid for.

### 2 · Her manual grant

`setSubjectAccess` writes a `grant`-source entitlement. Entitlements resolve as
`max(patreon, grants)`, so a hand-set level can only ever OPEN access, never
close it. That is deliberate and worth stating: a manual control that could
*lower* access would eventually be used to lock out a paying member by accident,
and would quietly fight the next reconcile. Level 0 deletes the grant rather
than storing a zero, so no row ever sits there looking like a decision that does
nothing.

It exists for the cases the API cannot express: Patreon being wrong, someone who
paid another way, a gift.

### 3 · The inbox's missing middle state

Threads had exactly two appearances: unread, and everything else. Worse, nothing
marked a thread read except *replying* — so opening a message she meant to come
back to left it looking identical to one she had actually answered, and it
vanished into the list.

Three states now, and `markThreadRead` runs when she opens a thread:

- **unread** — they wrote, she hasn't opened it → red
- **unreplied** — she has read it, they still spoke last → gold
- **answered** — she spoke last → quiet

`markThreadRead` is called AFTER `flagged` is computed, or arriving at a
safety-flagged thread would clear its own warning banner before she read it.

Sorting is now newest-activity-first (safety-flagged still jumps the queue),
because state is carried by colour — so nothing she has already read sinks out
of sight the way it did when unread count drove the order.

### 4 · Whole-row click

The inbox row is one `<Link>` wrapping the card. The name is deliberately NOT
its own link any more: an `<a>` inside an `<a>` is invalid HTML and the browser
silently drops the inner one, so that "link" was never real. The route to a
profile is stated once at the bottom of the list instead of failing silently on
every row.

Colour is never the only signal — each row carries a dot and a worded badge too.

### 5 · Not done, on purpose

- No Patreon webhook. It would be faster than hourly, but it needs a public
  endpoint, a shared secret and replay handling; the sweep plus the two manual
  buttons closes the actual hole today. Worth doing later, not instead.
- The reconcile does not create accounts for pledges that never connected —
  there is no account to open, and R8's manual import already covers that path.

---

## 2026-07-31 — Whisper images post as they are; whispers became editable

Reported: "when I add an image to a whisper its cropped, this is not natural I
should have the option to crop etc but normally image is posted as it shows",
plus two asks in the same breath — reference a file in a whisper so a subject
lands ON that file, and be able to change an old whisper (its privacy included)
and see how it looks to them.

### 1 · The crop was the layout's, not hers

The feed card put every image in a fixed `aspect-[5/2]` box (16/9 when pinned)
with `object-cover`. Anything that wasn't landscape got sliced. The composer
previewed with `max-h-64 object-cover`, so she couldn't even see what she was
about to lose.

`natural` is now the default and the stored truth (`whispers.image_fit`, with
`image_w` / `image_h` measured in the browser at upload so the card reserves the
right space and the feed doesn't jump). `wide` and `square` remain, as choices
she makes with the result shown to her first. Existing rows default to
`natural` — the pictures already posted stop being cropped.

One component, `WhisperImage`, renders it in the feed AND in the composer, so a
preview can't drift from what lands.

### 2 · A whisper can point AT a file

The attached track used to send a sealed viewer to `/library` and an entitled
one straight into the player, with no way to reach the file's own page. Now the
cover plays and the title opens `/library/track/<slug>`. "It's up" became a
whisper that takes them there.

### 3 · Editing, and why it beats deleting

PLAN treated a whisper as unchangeable — the audience it went to being part of
what it *was*. That rule cost more than it protected: the only fix for a
mis-aimed whisper was deletion, which cascades its loves and every private
comment beneath it. `editWhisper` changes the words, the picture, the file it
points at, and the reach, in place, keeping everything given under it. It sends
NO push (an edit is not a new whisper) and leaves an attached poll alone (votes
are already cast against it). Every edit is audited with before/after.

The edit page previews with the real feed component — "check how it looks to
them" is the actual card, not an approximation.

---

## 2026-08-01 — Her file on a person, and replies that actually answer him

Asked for: a button on every profile to read the conversation; somewhere to put
what she knows about the person, visible to her; and "propose reply" to read
that profile and write with a real goal — keep trust, make him feel heard and
understood, keep her present and dominant, and lead him to stay, pay and give.
Explicitly: whole-conversation context, no clichés, not overly mystic.

### 1 · `subject_notes` — what the counters can't hold

The app knew his hours, his chain, his triggers. It did not know what he told
her at 2am. Notes are hers: never rendered to a subject, and deliberately NOT
in the subject's data export — it is her working memory about a person, not a
record she keeps on their behalf, and handing it over would end the only thing
it's for. Held (pinned) notes lead the file and lead what the drafter reads.

### 2 · The drafter was answering nobody

It got a one-line summary and the last TEN messages. That produces replies that
could be pasted into anyone's conversation, which is exactly what makes them
feel like nothing. It now reads the whole thread (newest-first budget, so the
recent exchange is never what gets dropped) and a full dossier: standing,
frozen/grace, hours, chain, triggers, whether he has EVER paid beyond the
pledge, what he petitioned for in his own words, his ritual answers, how long
since he last listened — and her notes, marked as outranking all of it.

Three drafts are now three different MOVES, not three phrasings: hold him /
pull him deeper / take control, each with one line on why it lands on this man.
She picks an intention.

### 3 · The brief, and its floor

The brief states the commercial goal plainly — devotion should feel good and
reciprocated so that staying, upgrading, commissioning and gifting are the
natural next act. It also states the floor: no invented scarcity, no fake
deadline, no asserting anything about her that isn't in the material. Trust is
the asset being compounded; a reply that spends it for one conversion is a bad
reply, and the brief says so in those words.

Banned explicitly, because they were what the old drafts produced: mystic
filler (void/abyss/starlight), reflex domme lines, therapy-speak ("I hear you",
"that's valid"), corporate warmth, and generic praise that would fit any man.

Safety triage is untouched: a flagged thread still offers no draft at all, and
nothing is ever auto-sent.

---

## 2026-08-02 — The profile writes itself; she presses Update

Correction to the day's earlier work: notes she types by hand were the wrong
primary. She has a hundred of these people, and everything needed to know them
is already in the app, scattered across four tables.

`subject_profiles` is the AI's read on one person, rebuilt on demand from ALL
of it: the whole conversation, every petition, every comment left under a
whisper (unprompted, therefore honest), his ritual answers, his standing and
history — and her own notes, which still outrank everything. It returns what he
wants, what works on him, what to avoid, how he gives and what would move him
further, whether he is drifting, and concrete openings she can use today.

Deliberate choices:

- **A button, not a cron.** Reading a person costs a real model call, and she
  knows when there is something new worth reading. `messages_seen` is stored so
  the button can say "Update · 3 new" — a stale file announces itself instead of
  quietly misleading her.
- **One row, replaced in place.** This is a current read, not a history.
- **Grounding is enforced in the brief.** It must not invent a job, a trauma, a
  relationship or a motive; where the material doesn't support a claim it says
  so. A confident profile built on nothing is worse than no profile, because she
  would act on it.
- **Hand notes stay, and stay on top.** The AI reads what the app recorded; she
  knows what he said on the phone. Both go to the drafter, hers weighted higher.

The read also renders beside the thread while she answers — portrait, what
works, what not to do — because that is the only moment it is worth anything.

---

## 2026-08-02 — Exporting the membership for something else to read

Asked: the best way to get everything gathered from members out, so an AI can
work on it and build files.

Rejected: a database dump (carries secrets, needs the schema in your head, no
model reads it well) and CSV (destroys conversations). Chose a ZIP of one
MARKDOWN FILE PER PERSON — standing, what they've given, her notes, the app's
read, their answers, their petitions, their whisper comments, and the entire
private thread — plus `all-subjects.jsonl` of the same material for anything
programmatic, plus a README that tells the receiving model what it's holding
and a starting prompt.

- **Hand-rolled ZIP, store-only.** No dependency for a few megabytes a month.
  Because it's hand-rolled it is proved against the real `unzip -t` (which
  verifies every CRC), not against my own assumptions — with non-ASCII, a
  nested path and an empty entry in the fixture. Skipped, not failed, where
  `unzip` is absent.
- **Contacts off by default.** A profiling model does not need emails, and this
  archive is going to leave the server into someone else's tool. `?contacts=1`
  when she needs them.
- **Audited.** Every member's private words leaving in one download should
  leave a record that it happened.
- **Fenced.** A member's own text containing a code fence can't break the file
  it's in.
