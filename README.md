# OBEY AKASHA — Platform

Members platform for Akasha (femdom erotic-hypnosis creator): Patreon-gated
audio library, hypnosis-native player, push notifications, subject profiles,
commissions, and an admin cockpit ("the Sanctum").

## Project docs

| Doc | Purpose |
|---|---|
| [`docs/BRAND.md`](docs/BRAND.md) | Brand bible — voice rules, audience psychology, vocabulary, design direction. Governs all copy and AI output. |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature specification — confirmed features, additions with rationale, risks, priority map, decisions. |
| [`docs/PLAN.md`](docs/PLAN.md) | **Master build plan** — locked decisions, architecture, stack, data model, module specs, jobs, API map, env, tests, milestones M0–M7, launch checklist. |

## Status

Milestones **M0 (Foundations)** and **M1 (Media core) — built.**
M0: Patreon auth, entitlement engine, full data model, Sanctum tier-mapping +
audit, design tokens/styleguide, Docker + CI.
M1: pluggable media provider (local/Bunny) with signed Range streaming,
ffmpeg-optional ingest + Sanctum upload/publish, entitlement-filtered library,
the audio player (queue, end-modes, spirals, grounding, sleep timer, Media
Session), programs with sequential/daily gating, and listen telemetry + drop
reports. 64 tests. Next: **M2 (PWA + push)** — see PLAN §23.

**Builder:** read `docs/BRAND.md` → `docs/FEATURES.md` → `docs/PLAN.md`, then
execute milestones **M0 → M7** (PLAN §23). Follow the conventions in PLAN
§3/§24; log any deviation in `docs/DECISIONS.log.md` (append-only).

## Stack

Next.js 15 (App Router, PWA) · TypeScript strict · Tailwind v4 (token contract) ·
Postgres 16 + Drizzle · Auth.js v5 (Patreon) · pg-boss workers · faster-whisper
sidecar · Bunny media · VPS + Docker/Coolify. Rationale in PLAN §1–2.

## Local development

Prereqs: Node 22, pnpm 10, Postgres 16 (or use `compose.yml`).

```bash
pnpm install
cp .env.example .env                # set AUTH_SECRET; Patreon keys optional for M0
createdb obeyakasha && createdb obeyakasha_test
pnpm db:migrate                     # apply schema to $DATABASE_URL
pnpm db:seed                        # settings + starter tag/trigger vocabulary
pnpm dev                            # http://localhost:3000
```

Quality gate (matches CI):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

`pnpm test` runs unit + integration tests against `obeyakasha_test`
(override with `TEST_DATABASE_URL`). Hidden component catalog: `/styleguide`.

### Wiring real Patreon sign-in

1. Create a Patreon OAuth client (patreon.com/portal → Clients & API keys),
   redirect URI `http://localhost:3000/api/auth/callback/patreon`.
2. Set `PATREON_CLIENT_ID`, `PATREON_CLIENT_SECRET`, and `ADMIN_PATREON_USER_ID`
   (your own Patreon numeric user id — pins the goddess/admin role) in `.env`.
3. Sign in at `/signin`. Your campaign tiers auto-populate the Sanctum
   **Access** page for mapping to access levels.

## Docs

| Doc | Purpose |
|---|---|
| [`docs/BRAND.md`](docs/BRAND.md) | Voice rules, audience psychology, vocabulary, design direction. Governs all copy + AI output. |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature spec — confirmed features, additions with rationale, risks, priority. |
| [`docs/PLAN.md`](docs/PLAN.md) | Master build plan — architecture, data model, module specs, jobs, API map, env, milestones M0–M7. |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | **Get it online** — non-technical, step-by-step deployment guide (domain → server → launch). |
| [`docs/DECISIONS.log.md`](docs/DECISIONS.log.md) | Append-only log of build-time deviations from the plan. |
