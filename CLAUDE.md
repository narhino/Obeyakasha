# Repo guide for Claude

Members platform for Akasha (hypnosis-audio creator). Read `docs/PLAN.md` before
building — it is the authoritative spec. This file is the quick operational map.

## Golden rules

- **Voice:** every subject-facing string comes from `src/copy/copy.ts` (or a DB
  template), written in Akasha's voice per `docs/BRAND.md`. Never inline copy in
  JSX. Never generic app-speak ("Success!", "Oops!").
- **Tokens only:** components style via the tokens in `src/app/globals.css`
  (PLAN §4). No raw colors/fonts. Every primitive appears on `/styleguide`.
- **Config over hardcode:** tunables live in the `settings` table
  (`src/lib/settings.ts`), not literals. Fixed keys are typed in
  `SETTINGS_DEFAULTS`; dynamic keys use `getRawSetting/setRawSetting`.
- **Audit everything:** every Sanctum mutation calls `logAudit()`.
- **Validate everything:** API/action inputs and LLM outputs via zod.
- **Privacy:** never expose transcripts to subjects, other subjects' existence
  to any subject (D7), raw storage URLs, or LLM provider names in the UI.
- Log any deviation from PLAN in `docs/DECISIONS.log.md` (append-only).

## Layout

```
src/app            routes: (public) / /signin /styleguide, /library (subject),
                   /sanctum/** (admin, middleware-gated to role=goddess)
src/components/ui  token-only primitives (Button, Card, Display, Whisper, …)
src/copy/copy.ts   all subject-facing strings (in-voice)
src/lib/db         Drizzle schema (schema/*.ts by domain) + client + migrate
src/lib/entitlements  core.ts (pure, tested) + resolve.ts (DB-backed)
src/lib/patreon    client.ts (API) + sync.ts (sign-in sync)
src/lib/settings.ts  ADMIN-CONFIG store  |  src/lib/audit.ts  audit helper
src/auth.config.ts edge-safe auth (middleware)  |  src/auth.ts  Node auth (adapter+events)
src/workers        pg-boss worker (stub in M0)
src/transcriber    faster-whisper FastAPI sidecar (stub until M3)
drizzle/           generated migrations (commit them)
```

## Commands

```bash
pnpm dev | build | start | typecheck | lint | test
pnpm db:generate   # after editing schema/*.ts — creates a migration
pnpm db:migrate    # apply migrations
pnpm db:seed       # settings + starter vocabulary
pnpm worker        # run the worker process
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, migrate, **schema/migration
drift check**, test, build against a Postgres service. Keep it green. After any
schema change, run `pnpm db:generate` and commit the new `drizzle/*.sql`.

## Auth model

Auth.js v5, JWT sessions. `session.user.role` is `subject` | `goddess`. The
goddess is pinned by `ADMIN_PATREON_USER_ID`. Middleware (`src/middleware.ts`)
uses the edge-safe config and gates `/sanctum` + `/api/sanctum` to `goddess`.

## Milestones

M0 (done) → M1 media/player → M2 PWA/push → M3 transcription/organize →
M4 relationship core → M5 commissions/offline → M6 scale (v1.1) → M7 launch.
Details + acceptance criteria in PLAN §23.
