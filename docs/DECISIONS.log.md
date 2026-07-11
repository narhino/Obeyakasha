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
