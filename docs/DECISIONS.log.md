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
