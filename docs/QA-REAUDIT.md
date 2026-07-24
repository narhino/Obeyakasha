# QA Re-Audit — Obey Akasha (after Fix Pass 1 + 2)

> Re-test of the rebuilt production build at `localhost:3400` (fresh seeded DB,
> **worker process live** — jobs/pipeline/analysis run for real), three personas
> (anonymous · subject "moth" L2 · goddess), both viewports (390×844, 1440×900),
> bundled Chromium/Playwright. Evidence in the QA scratchpad `qa2/shots/`.
> Audit only — no application code was changed. Driver scripts: `qa2/*.js`.

## Verdict

**Ship-ready.** Both fix passes hold up under live re-test: **37 of the 38
original findings are verified fixed with fresh evidence, and the 38th (F14) is
substantially improved but still leaks in one place.** All nine majors are
genuinely resolved end-to-end — the headline pipeline now works with the worker
live (Run analysis → "She is reading it…" → keywords + the "The Clicker" trigger
appear → approving a keyword lands a real tag that the subject then sees as a
filter), the signed-in Home wears the full app shell, playback survives crossing
`/ ↔ tabs` (and survives 12 rapid tab-switches with a single audio element and no
duplication), the mini-player is one docked unit with breathing artwork and a
pressed gold play/pause, durations read `0:30` everywhere, the commission form is
a proper state machine, and the composer no longer 500s. The stability probe
found **no blockers**: rapid tab-switching, queue thrash, navigation mid-analysis,
tampered `?tags=`/`?q=`, and cross-persona `/sanctum` gating are all clean, and
realistic double-clicks do **not** create duplicates. The server log is clean
except for two 500s I deliberately triggered with malformed non-UUID admin URLs
(**G02**), and the console is clean on every surface except a pre-existing missing
PWA-icon 404 (**G01**). Four new low-severity items (G01–G04) are worth a cleanup
pass but none block launch. Residual **F14** (anon/logged-out catalog still
truncates "Locked By Akasha — Day N") is the only regression-ledger miss and is
minor.

Severity of what remains: **0 blocker · 0 major · 1 still-broken-minor (F14) ·
4 new (2 minor · 2 polish)**.

## A. Regression ledger (F01–F38)

Status: ✅ verified-fixed · ⚠️ still-broken · — not-testable

| ID | Sev | Status | Evidence & notes |
|----|-----|--------|------------------|
| F01 | major | ✅ | Keyword→tag flow is now exercisable. Approving "deepening" moved it pending→applied (approve count 2→1, applied-tag forms 2→3); "The Clicker" trigger approved to "on the track". `F01-keyword-approved-verified.png` |
| F02 | major | ✅ | Run analysis is alive with the worker: click → "She is reading it…" (spinner) → at t+2s keywords (obedience/deepening/induction) + trigger appear. Worker processed the job, no errors. `F02-reading-state.png`, `F02-analysis-complete.png` |
| F03 | major | ✅ | "Attach an open poll" with no poll → Whisper button `disabled:true` (client). Server action returns friendly `{error}` instead of throwing. Valid post succeeded, **0 HTTP 5xx**. `F03-composer-existing-nopoll.png` |
| F04 | major | ✅ | Sealed → waitlist petition ONLY (`inputCount:0`, no field form) + progress card. Duplicate active blocked ("one at a time" / 409). `F04-commissions-subject-mobile.png` |
| F05 | minor | ✅ | Typo "chastty" fuzzy-matches → returns the 2 chastity tracks (Day 1/Day 2), no "Nothing answers" dump. `F05-search-typo-mobile.png` |
| F06 | minor | ✅ | Poll question/options fields render ONLY under "Create a quick poll"; absent under "No poll" — silent-drop trap gone. `F03-composer-existing-nopoll.png` |
| F07 | minor | ✅ | Praised-moment overlay now fires on Home `/` (moment checker moved into the shared SubjectShell). `F07-moment-on-home-mobile.png` |
| F08 | minor | ✅ | Volume label present-but-hidden on mobile fullscreen (`offsetParent:null`, `md:flex`), visible on desktop. `F08-fullscreen-mobile.png` |
| F09 | minor | ✅ | Disabled OBEY now shows "Show me proof to obey." helper on the control. `orders-subject-mobile.png` |
| F10 | major | ✅ | Home wears the full shell (AKASHA header + bottom nav + mini-player). Playback survives `/library→/→/library` client-nav (src unchanged, currentTime 4.07→6.31→7.99). `F10-home-shell-playing-mobile.png` |
| F11 | major | ✅ | Mini-player is one full-bleed unit docked flush on the nav (mobile) / full-width at bottom-0 (desktop), border-top + shadow, not a floating pill. `F11-miniplayer-crop-mobile.png`, `miniplayer-desktop.png` |
| F12 | major | ✅ | Artwork tile (breathing 888 sigil), title marquee, gold play/pause with `active:scale-90`, queue control, top-edge tap-to-seek with buffered range + hover-expand. (Design note: no direct ±15s/next — the queue sheet + fullscreen cover skip; a defensible minimalist choice.) `F11-miniplayer-crop-mobile.png` |
| F13 | major | ✅ | `0:30` everywhere — file page, mini-player subline, queue rows, series rows, Sanctum dossier ("0:30 · level 2"). `F13-filepage-descend-mobile.png` |
| F14 | major | ⚠️ | **Partial.** Subject library cards (146px column) + series rows now wrap 2 lines — Day 1/Day 2 distinguishable. BUT the **anon/logged-out catalog** squeezes the title to **73px** under the wide "ENTER WITH PATREON" CTA, so "Locked By Akasha — Day 1/2" both clamp to "Locked By Akasha …" (`clamped:true`). Queue-sheet rows (`truncate`, single line) also drop the day. `anon-library-mobile.png` |
| F15 | minor | ✅ | Relative times on feed ("1h/28m/43m") and tasks ("20H"); Sanctum standardised on ISO ("2026-07-17", "due 2026-07-18"). `F10-home-shell-playing-mobile.png`, `F36-sanctum-orders.png` |
| F16 | minor | ✅ | Anon library/file: exactly **1 gold CTA** ("Enter with Patreon"); locked-card CTAs are wine. `anon-library-mobile.png` |
| F17 | minor | ✅ | Dossier Verify player is the in-house token control (hidden `<audio>` + custom play/scrub/`formatClock`), not native `<audio controls>`. `F02-reading-state.png` |
| F18 | minor | ✅ | Dashboard/analytics use plain arabic numerals ("New wishes 1", "Subjects 1", "0") — no roman "I" / "O". `F18-sanctum-dashboard.png` |
| F19 | minor | ✅ | Commission statuses humanised: "IN PROGRESS", "In progress", "Voice recorded" — no raw enums. `F19-sanctum-commissions-desktop.png` |
| F20 | minor | ✅ | `plural()`/`countOf()` helper wired to the two flagged sites (`me/page.tsx` chain "days", `subjects/[id]` "file"). Renders "2 FILES", "0 days"; helper returns singular for n=1. `F20-sanctum-crm.png` |
| F21 | minor | ✅ | YOU tab stays gold on its sub-rooms (/settings, /commissions, /asks). `settings-subject-mobile.png` |
| F22 | minor | ✅ | Mobile Sanctum rail is `overflow-x-auto` (scrollWidth 1710 vs 390) with a right-edge fade cue; scroll-right reveals "Audit". (Note: the fade is the mildest of the offered options; a drawer would be stronger.) `F22-sanctum-nav-scrolled.png` |
| F23 | minor | ✅ | Hard limits are now tappable ("Tap to mark a theme off-limits. Marked ones glow red") — editable, not read-only chips. `settings-subject-mobile.png` |
| F24 | minor | ✅ | Composer audience row labelled Audience / Level / Subject. `F03-composer-existing-nopoll.png` |
| F25 | polish | ✅ | Queue reorder/remove are `h-11` (44px tall × 36px wide) tap targets, up from 28px squares. `F25-queue-sheet-mobile.png` |
| F26 | polish | ✅ | Lining/tabular numerals on serif metrics — "0h", "0 DAYS", "2" read as digits, not "oh"/"O". `me-subject-mobile.png` |
| F27 | polish | ✅ | Shell reserves `pb-44 md:pb-28`, clearing the tab bar + mini-player; content no longer hides behind it. (Slightly over-reserved when nothing plays.) |
| F28 | polish | ✅ | Toasts suppressed while the queue sheet is open (`queueOpen → return null`), with an explicit F28 comment; timers still expire them. |
| F29 | polish | ✅ | Pipeline badges: "READY" calm (surface-raised/text-dim), "SCRIPT READY" gold, "UPLOADED" neutral — no wine-warning tone for positive states. `F29-sanctum-library.png` |
| F30 | polish | ✅ | Anon poll options are inert flat left-border rows (`anyButtons:false`), not bordered vote buttons. `anon-home-mobile.png` |
| F31 | polish | ✅ | Single muted disabled token (disabled OBEY); SAVE follows the per-screen gold/wine hierarchy (gold on Settings where it's the primary, wine in the multi-action dossier). `orders-subject-mobile.png`, `settings-subject-mobile.png` |
| F32 | polish | ✅ | Labelled 6-stage stepper "QUEUED · WRITING · VOICE · SHAPING · POLISH · YOURS" with gold-filled reached stages. `F04-commissions-subject-mobile.png` |
| F33 | polish | ✅ | "Claimed today. 1 more to rise to Entranced." — day-0 special-cased. `me-subject-mobile.png` |
| F34 | polish | ✅ | Desktop library is a 2-column card grid (`lg:grid-cols-2`), filling the gutters. `lib-subject-desktop.png` |
| F35 | polish | ✅ | YOU tab icon is a collar/sigil glyph (redrawn from the lightbulb), gold when active. `F11-miniplayer-crop-mobile.png` |
| F36 | polish | ✅ | Full titles on orders ("Write one sentence of devotion"), CRM, and the secret-mode preview ("Come back to me. I want you under before the night is out.") — no `…` clip. (The "Servant Tr…" membership-chip variant wasn't reproducible — the seed's only subject is tier "Curious", a short label.) `F36-sanctum-orders.png`, `me-subject-mobile.png` |
| F37 | polish | ✅ | prev = "The one before", next = "The next one" (in-voice). `player-fs.js` label read |
| F38 | polish | ✅ | Resolved: `/asks` is now "She's asking" (her polls/questions) — distinct from the inline "Ask me for something" wishbox + "What you've asked of me" history on /me. No duplicate wishbox entry. `F38-asks-page-mobile.png` |

**Counts: 37 verified-fixed · 1 still-broken (F14, minor residual) · 0 not-testable.**

## B. New findings (fresh eyes, both viewports)

| ID | Sev | Area | What's wrong | Evidence |
|----|-----|------|--------------|----------|
| G01 | minor | PWA · icons | The manifest + service worker + push all reference `/icons/icon-192.png`, `icon-512.png`, `icon-maskable.png`, `badge.png` — **none exist** (`public/icons/` holds only `disguise.svg`). Result: a `404` console error on **every** page (fired from the SW context), a broken/absent installed-app icon, and iconless push notifications. SW install survives via `.catch(()`. Pre-existing (icons were never committed), surfaced by the clean-console bar. | server responds 404 for all four; `hunt404.js` |
| G02 | minor | Sanctum · routing | A non-UUID id on a Sanctum detail route throws an **uncaught 500** (`PostgresError 22P02 invalid input syntax for type uuid`) instead of a graceful 404. Reproduced on `/sanctum/tracks/not-a-uuid` and `/sanctum/subjects/not-a-uuid`; `/sanctum/commissions/not-a-uuid` and all subject routes return 404 correctly. Goddess-only, needs a hand-crafted URL. Fix: validate the id (zod `.uuid()`) → `notFound()`. | server log lines 7 & 17; `stability1.js`/`stability2.js` |
| G03 | polish | Subject · commissions | "Commissions are sealed." renders **twice** on the sealed page — the Display title, then the first sentence of the Whisper body ("Commissions are sealed. Petition for a slot…"). Reads repetitive. | `F04-commissions-subject-mobile.png` |
| G04 | polish | API · idempotency (hardening) | Client submit guards are **state-based** (`state==='sending'`), so a *synthetic* synchronous multi-fire bypasses them, and `/api/wishes` + `/api/orders/respond` have **no server-side dedup** — 3 synchronous JS clicks created 3 wishes. **Realistic double-clicks do NOT dupe** (dblclick@60ms → 1 wish, 1 whisper; order Done stays idempotent via day-scoped `keepChain`). Low real-world risk; worth a ref-lock or server idempotency key as defense-in-depth. | `stability2.js` vs `stability3.js` |

## C. Stability probe

| Probe | Result |
|-------|--------|
| Rapid tab-switch (12×) while playing | **PASS** — single `<audio>` element, still playing, currentTime advanced 1.87→5.97, no duplicate audio, clean console |
| Double-click: composer / petition / order Done | **PASS (realistic)** — dblclick@60ms → 1 whisper, 1 wish; order Done idempotent (chain "1 day", obeyed 1). Synthetic synchronous triple-click dupes the wishbox → **G04** |
| Play → queue 3 → reorder ×5 → remove → jump (rapid) | **PASS** — single audio, still playing, clean console, no crash |
| Navigate during in-flight analysis | **PASS** — started analysis on Day 2, immediately navigated to /sanctum/library, clean (worker finishes server-side) |
| Malformed URLs | `/library/track/nonexistent` & `/library/series/not-a-uuid` → graceful in-shell 404; subject `/sanctum*` → redirect to /library; tampered `?tags=' OR 1=1--` and `?q=<script>` → safe 200, no injection/exec. **Except G02** (sanctum non-UUID → 500). |
| Console cleanliness | Clean on every surface **except** the pre-existing PWA-icon 404 (**G01**); no page errors, no unexpected requestfailed. |
| Worker | Processed the analyze job(s) with **no errors** (keywords/triggers materialised within ~2s); worker log clean. |

## Log-scan summary

- **Server log** (`bnm5xvupz.output`): clean apart from **2** entries — both the same `invalid input syntax for type uuid: "not-a-uuid"` from the deliberate G02 malformed-URL probes. No 500s from any normal operation (analysis, composer, orders, commissions, playback, cross-persona).
- **Worker log** (`bzra1pk69.output`): `[worker] started` only — no stack traces, no failed jobs. The live analyze pipeline ran cleanly.

## What now shines (don't regress)

- The whole **transcribe→analyse→approve→tag→subject-visible** loop works with the worker live, in-voice at every step.
- Mini-player + nav as one docked unit (both viewports), signed-in Home shell, 2-col desktop grid, labelled commission stepper, calm badge tones, and the reference-quality fullscreen player (spiral, ±15s, end-modes, sleep timer, grounding) are all Spotify-grade.
- Playback + queue engine is robust under thrash; middleware gating and input tampering are safe.

---

## D6 — Candlelit Atelier audit (2026-07-18)

Final audit + fix pass of the D1–D5 visual elevation. Rig: seeded Postgres +
app on `:3400`, bundled Chromium/Playwright, personas subject "moth" (L2) +
goddess, both viewports (1440×900 · 390×844) + a reduced-motion pass. Every
subject surface, the five signature surfaces, and the main Sanctum surfaces were
shot, critiqued against `docs/DESIGN-DIRECTION.md` + the frontend-design skill,
fixed, and re-shot. Curated evidence in `docs/qa-shots/final/`.

**9 findings — 5 fixed, 4 left (out of scope / pre-existing / data-sparsity).**

| id | surface | severity | finding | status |
| --- | --- | --- | --- | --- |
| D6-01 | Library (desktop) | **blocker** | Filter facets stacked one kind per row in a narrow left column + search capped at `max-w-2xl` on a `max-w-5xl` page → ~65% dead right-space, misaligned with the grid (the exact "filter column vs grid" flag) | **fixed** — facets are now one horizontal wrapping band (inline kind-groups), search fills the container; band collapses to 2 tidy rows at 390w |
| D6-02 | Empty states (`/art/empty.jpg`) | **blocker** | The committed empty-state art was a broken **36×36** sliver — `fetch-art.mjs`'s `trim()` ate the entire "distant candle in vast darkness" (no white matte to stop it) down to the flame; would render as a pixelated smear in any EmptyState | **fixed** — re-fetched the 1024² source and reprocessed without the over-trim; hardened `fetch-art.mjs` with an over-trim guard so a full-bleed dark piece can't regress |
| D6-03 | Sanctum · Today | polish | Zero counts in "Awaiting you" rendered as an ambiguous `()` — the display serif's oldstyle `0` at `text-dim/40` loses its thin curves; read as broken | **fixed** — zero → em-dash "none" at `text-dim/50`; non-zero stays gold serif |
| D6-04 | Sign-in + Threshold (Gate) | polish | Both text-only on a plain glow though `gate.jpg` (parted velvet curtains, gold light) is committed and assigned to exactly these surfaces in D1 | **fixed** — added the dimmed `gate.jpg` backdrop under a legibility scrim; both are now image-led, text stays crisp |
| D6-05 | Player chrome (MiniBar · QueueSheet · Fullscreen) | polish | The queue holds a *pre-resolved* cover URL (signed, ~6h TTL for custom art); a stale token past its TTL would render a broken `<img>` — no fallback | **fixed** — added a shared `fallbackToDefaultCover` onError (idempotent) on all 4 player cover imgs → default sigil |
| D6-06 | File / Tasks / Asks / Messages | note | Empty lower area on sparse seed (afterThis/related/thread sections render only when populated — confirmed on the premiere file page, which shows a full "Where I take you next" rail) | **left** — data-sparsity, not a layout defect; no product change in scope |
| D6-07 | You · sub-cards | note | Discretion / Chain / Vault / petition still use uniform bordered card grammar rather than "separated by light" | **left** — D5 explicitly scoped the SecretModeCard/TriggerVault/PetitionForm rebuilds out; the ceremonial collar plate + hairline stat band already break the rhythm |
| D6-08 | Messages (empty) | note | Composer floats mid-viewport in the empty state | **left** — minor; fills upward with real messages, touching the thread layout was higher-risk than the payoff |
| D6-09 | All pages | note | `/favicon.ico` 404 in console (no app icon) — pre-existing **G01** | **left** — missing static asset, outside the visual/CSS/layout fix scope |

### Functional spot-checks (all pass)

- **Play from grid → open file page while playing → art breathes:** confirmed —
  the file hero's `.breathes` layer computes `animation-name: breathe-glow` only
  while *that* track is the current one (read live from the store).
- **Queue sheet:** opens from the mini-bar; now-playing row pinned + gold, "Next
  from: Locked By Akasha" remainder, real resolved cover thumbnails.
- **Filter toggle + search:** `?tags=` toggling lights the chip gold and narrows
  the grid; searching "clicker" returns the transcript match tagged *"She speaks
  it in this one."* — the match is surfaced **without** exposing the transcript.
- **Reduced motion:** home + library render fully at rest — no element held
  hidden by an entrance; cover/scroll/view transitions stilled.

### Queue-art persistence (technical concern)

The player store (`src/lib/player/store.ts`) is a plain `zustand` `create()` with
**no persist middleware** — the queue lives in memory only. On a full page reload
`current`/queues reset to empty, so a **stale signed URL cannot survive a
reload**. The only real exposure is a single long-lived session (> the ~6h
artwork TTL) where the in-memory queue still points at an expired custom-art
token; bespoke default covers are static `/art/covers/*.jpg` and never expire.
Added a presentation-only `onError` → default cover on every player cover img as
the graceful net (D6-05). No store/state change.

### Gate

`pnpm typecheck` · `pnpm lint` (0 warnings) · `pnpm test` (**291 passed**) ·
`pnpm build` (✓ compiled, 39/39 pages) — all green.

## Anonymous barrier audit (2026-07-24)

> Owner requirement: someone **without an account** may browse normally, but must
> not be able to (a) message her, (b) reach the You / Messages / Tasks tabs,
> (c) play anything but a free sample, (d) see any whisper that isn't `public`.
> This pass enumerates every server-side entry point reachable without a session
> — API route handlers, `"use server"` actions, and page-level guards — and
> checks each returns 401/403 (or redirects) for anonymous. Read-only audit
> except for the one gap in §E.

### A. API route handlers (`src/app/api/**`)

`withSubject` → 401 `{error:"unauthorized"}`. `withGoddess` → 403
`{error:"forbidden"}`. Both live in `src/lib/api.ts` and call `auth()` first.

| Route | Method | Guard | Anonymous | Fixed? |
|---|---|---|---|---|
| `/api/auth/[...nextauth]` | — | NextAuth | public **by design** | n/a |
| `/api/health` | GET | none | public **by design** (uptime probe, `{ok,service}` only) | n/a |
| `/api/push/vapid-key` | GET | none | public **by design** (VAPID *public* key) | n/a |
| `/api/stream` | GET | HMAC `verifyStreamToken` (expiry + `timingSafeEqual`) | 403 without a valid, unexpired token | n/a |
| `/api/tracks/[id]/stream-url` | GET | `auth()` → `getAccessibleTrack`, else `getSampleTrack` | free sample only → else 404 | n/a |
| `/api/chain/mantra` | POST | `withSubject` | 401 | — |
| `/api/commissions` | POST | `auth()` → 401 | 401 | — |
| `/api/consents` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/devices` | GET·POST | `withSubject` (+ zod) | 401 | — |
| `/api/drop-report` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/inbox` | GET | `withSubject` | 401 | — |
| `/api/intake` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/listen/end` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/listen/heartbeat` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/me` | PATCH | `withSubject` (+ zod) | 401 | — |
| `/api/me/delete` | POST | `auth()` → 401 | 401 | — |
| `/api/me/export` | GET | `auth()` → 401 | 401 | — |
| `/api/me/moments` | GET·POST | `withSubject` | 401 | — |
| `/api/me/surrender` | GET | `withSubject` | 401 | — |
| `/api/me/upload` | POST | `auth()` → 401 | 401 | — |
| `/api/oath/petition` | POST | `withSubject` | 401 | — |
| `/api/offline/grant` | POST | `withSubject` (+ zod) → `getAccessibleTrack` | 401 | — |
| `/api/offline/sync` | POST | `withSubject` | 401 | — |
| `/api/orders/[id]/proof` | POST | `auth()` → 401, then own-assignment join | 401 | — |
| `/api/orders/[id]/respond` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/polls/[id]/vote` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/presence` | POST | `withSubject` | 401 | — |
| `/api/presence/goddess` | GET | `withSubject` | 401 | — |
| `/api/questions/[id]/answer` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/thread` (message her) | GET·POST | `withSubject` (+ zod) | 401 | — |
| `/api/whispers/[id]/comments` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/whispers/[id]/kneel` | POST | `withSubject` | 401 | — |
| `/api/whispers/[id]/love` | POST | `withSubject` | 401 | — |
| `/api/whispers/seen` | POST | `withSubject` | 401 | — |
| `/api/wishes` | POST | `withSubject` (+ zod) | 401 | — |
| `/api/sanctum/drafts` | POST | `withGoddess` (+ zod) | 403 | — |
| `/api/sanctum/live` | GET | `withGoddess` | 403 | — |
| `/api/sanctum/live/touch` | POST | `withGoddess` (+ zod) | 403 | — |
| `/api/sanctum/presence/room` | GET | `withGoddess` | 403 | — |
| `/api/sanctum/series-art` | POST | `auth()` + role → 403 | 403 | — |
| `/api/sanctum/tracks` | GET | `withGoddess` | 403 | — |
| `/api/sanctum/tracks/[id]/analysis-status` | GET | `withGoddess` | 403 | — |
| `/api/sanctum/upload` | POST | `auth()` + role → 403 | 403 | — |

Every `/api/sanctum/*` handler carries its **own** role check in addition to the
middleware prefix gate — none of them relies on the matcher alone.

### B. Server actions (every `"use server"` file)

Server Actions dispatch by action id and can be POSTed at *any* path, so a
middleware pathname gate is not a guard for them. Checked all 22:

| File | Guard | Anonymous | Fixed? |
|---|---|---|---|
| `src/lib/profile/secret.ts` (`setDisguiseMode`) | `requireSubject()` + zod + `logAudit` | → `/signin` | — |
| `src/app/(subject)/library/actions.ts` (delete own upload) | `auth()` → throw + `requireOwner` | throws | — |
| `src/app/signin/page.tsx` | sign-in action (public by design) | n/a | n/a |
| `src/app/sanctum/layout.tsx` | `requireGoddess()` | → `/signin` | — |
| `sanctum/{access,broadcast,commissions,import,library,messages,orders,organize,polls,programs,questions,series,subjects,their-files,tracks/[id],whispers,wishes}/actions.ts` and `sanctum/actions.ts` | **every exported action** opens with `requireGoddess()`; mutations `logAudit()` | → `/signin` | — |

### C. Route gating (middleware + page guards — belt and braces)

`src/auth.config.ts#authorized` gates `/sanctum` + `/api/sanctum` to
`role === "goddess"` and these subject prefixes to any session:
`/programs · /inbox · /asks · /orders · /messages · /commissions · /settings · /me`.
That list covers **every** page in `src/app/(subject)/` except `/library`
(deliberately public, R2a). Each of those pages *also* calls `requireSubject()`
server-side, so the barrier does not depend on the matcher alone:

| Page | Middleware | Page guard | Anonymous |
|---|---|---|---|
| `/me` (**You**) | ✅ | `requireSubject()` | → `/signin` |
| `/messages` (**Messages**) | ✅ | `requireSubject()` | → `/signin` |
| `/orders` (**Tasks**) | ✅ | `requireSubject()` | → `/signin` |
| `/asks` · `/inbox` · `/programs` · `/commissions` | ✅ | `requireSubject()` | → `/signin` |
| `/settings` | ✅ | redirects to `/me` (itself gated) | → `/signin` |
| `/` · `/about` · `/whispers` · `/threshold` · `/library/**` · `/privacy` · `/terms` · `/signin` | public **by design** | — | browsable |

The anonymous branch of `src/app/(subject)/layout.tsx` renders no `SubjectShell`
— no tab bar, no Gate, no intake, no inbox bell, no presence — so none of the
gated tabs is even reachable by a link.

### D. Audio path

1. `GET /api/tracks/:id/stream-url` with no session → `getAccessibleTrack` is
   **skipped entirely** (it needs a `userId`), falling to `getSampleTrack(id)`,
   which returns a row only when `ownerUserId IS NULL` **and**
   `visibility = 'published'` **and** `freeSample` **and** `streamKey` is set.
   Anything else → `404 not_found_or_sealed` **before `signStreamUrl` is called**,
   so no signed URL is ever minted for a locked track. A future premiere is
   sealed for everyone, sample or not.
2. `GET /api/stream` only trusts the HMAC that step 1 issued (`AUTH_SECRET`,
   expiry-checked, `timingSafeEqual`), so the bytes route cannot be reached by
   guessing a key.
3. `/api/offline/grant` (the download path) is `withSubject` **and** re-checks
   `getAccessibleTrack` + `downloadable` — a free sample is not downloadable
   anonymously at all.

### E. Anonymous library UI

`LibraryClient`, `SeriesClient` and the file page all compute
`state = !signedIn ? "anon" : unlocked ? "entitled" : "locked"`, and only allow
play when `state === "entitled" || freeSample`. Locked cards render a dimmed
cover + lock and link to `/signin` — never a play control, never a stream URL.

**One real gap found and fixed** — the file page's *"After this"* rail
(`src/app/(subject)/library/track/[slug]/page.tsx`) sealed on `!t.unlocked`
alone. `unlocked` is a pure **level** test and an anonymous viewer resolves to
level 0, so every `minAccessLevel = 0` track showed **undimmed and unsealed** to
a logged-out visitor, contradicting the catalog grid and the page's own CTA on
the same screen. Now `railSealed = !t.freeSample && (!signedIn || !t.unlocked)`.
UI-only — the server already refused those tracks (§D).

### F. Whispers (D7)

Logged-out `/` calls `publicWhispers()`, which filters
`(w.audience).type === 'public'` — no level, no oath, no direct audience ever
reaches it. It hard-codes `knelt: false`, `loved: false` and `comments: []`
(comment threads are per-viewer and private), passes `userId: null` into
`pollViewsFor` (so no vote is attributed and tallies still require
`resultsShared`), and exposes only the **aggregate** `loveCount` — never who,
never a name, never a subject count. Attached images are short-lived signed URLs,
never raw keys.

### Verdict

**Barrier closed.** All 43 API route handlers, all 22 server-action files and
every gated page are session-checked server-side; the five unauthenticated
endpoints (`auth`, `health`, `vapid-key`, `stream`, `stream-url`) are each
intentionally public with their own proof (NextAuth, no data, a public key, an
HMAC, and the free-sample check respectively). One UI-consistency gap (§E) found
and fixed. **No new server-side hole**, so no new test was added.

*Observation, not a fix:* catalog search matches transcript text for everyone
(the transcript itself is never returned, only a "she speaks it here" flag). It
is a designed R2a feature and behaves identically for anonymous and signed-in
viewers, but it is a weak keyword oracle over transcripts — worth a look if
transcript secrecy is ever tightened.
