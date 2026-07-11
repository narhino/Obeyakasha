# OBEY AKASHA — Master Build Plan (v1)

> **For the builder.** Read in this order: `docs/BRAND.md` (voice — governs all
> copy), `docs/FEATURES.md` (what & why), then this document (how). Feature
> codes (F1…, A1…) refer to FEATURES.md. This plan is the backbone: build
> exactly this, in milestone order. Where this plan says ADMIN-CONFIG, build a
> setting, not a hardcode. Where it says COPY, the string lives in the copy
> dictionary, never inline in JSX.

---

## 0. Locked product decisions (Akasha, 2026-07-11)

| # | Decision |
|---|---|
| D1 | **Patreon is the only payment rail at launch.** No Whop — its prohibited-products policy ("services intended primarily for adult sexual gratification") gives it discretion to freeze accounts over content classification, regardless of there being no nudity. Direct subscriptions/tributes deferred to v2 behind a `PaymentProvider` interface stub. |
| D2 | **Commissions = direct request, no checkout.** Subject fills an admin-editable form → lands in her Sanctum inbox as a commission request with statuses. Seed questions §16.1; she will align them with her Google Form via the form editor. |
| D3 | **Transcription mode is core.** Every track is transcribed (self-hosted Whisper). Transcripts are her script archive (admin-only), and the organize agent derives tags, triggers (with timestamps), and filters from transcript content. |
| D4 | **Offline downloads, YouTube-style.** Entitled tracks can be kept offline **inside the app only** (no exportable files). Encrypted at rest, entitlement-revalidated, purged on lapse/logout. |
| D5 | **A10 (bedtime ritual/dimming) is CUT.** Sleep timer remains in the player (F6). |
| D6 | **Polls (A24).** She sends a poll to all/segment; every subject is pushed to vote; she gets results; optional one-tap share of results back to subjects. |
| D7 | **No subject↔subject communication anywhere.** Messaging is strictly her↔subject, both directions. |
| D8 | **Design phase deferred.** Build with the token-based placeholder dark theme (§6); a later design pass restyles via tokens + component skins without rebuilds. |
| D9 | Catalog source: some files on her laptop (bulk upload), most on Patreon (import-and-match flow §9.4). |
| D10 | Domain not purchased yet — everything domain-agnostic via `APP_ORIGIN` env. Recommend `obeyakasha.com`. Staging runs on a temp subdomain. |

---

## 1. System overview

Single Next.js app (subject PWA + Sanctum admin + API) + a worker process +
a transcriber sidecar, one Postgres, media on Bunny. Everything in Docker on
one VPS, deployed by Coolify.

```
┌────────────────────────── VPS (Hetzner CPX31, Coolify) ──────────────────────────┐
│  web:        Next.js 15 (App Router) — subject PWA, Sanctum, API routes          │
│  worker:     Node — pg-boss consumer (transcribe, organize, push fan-out,        │
│              patreon-sync, imports, automations, analytics rollups)              │
│  transcriber: Python + faster-whisper — POST /transcribe → segments JSON         │
│  postgres:   Postgres 16 (app data + pg-boss queues + FTS)                       │
└───────────────────────────────────────────────────────────────────────────────────┘
        │ signed token URLs                    │ OAuth / webhooks / API
        ▼                                      ▼
  Bunny Storage + CDN (audio, spirals,   Patreon (identity, tiers, webhooks)
  images, backups — content-neutral host)
        ▲
  Web Push (VAPID) → installed PWAs (iOS 16.4+ homescreen, Android, desktop)
  LLM API (pluggable, §21) → organize agent, clustering, reply drafts
```

**Hosting rationale (verified):** Akasha's content is audio hypnosis with
erotic energy — no nudity, nothing pornographic. The infrastructure choice is
about *other companies' classifiers*, not the content itself: PaaS policies
(e.g. Vercel's AUP) reserve broad discretion over anything they deem
"sexually explicit", and a misclassification means takedown with no appeal
worth having. Bunny.net's AUP accepts any legal content and its team states
this explicitly — plus it's the cheapest way to stream audio anyway. So: app
on a VPS (Hetzner or DigitalOcean — content-neutral toward legal material),
media on Bunny, and no platform's opinion can ever interrupt the business.
Do not deploy this app to Vercel, Netlify, or Railway.

**Monthly cost estimate:** VPS ~€14 · Bunny ~$2–10 · domain ~$12/yr · LLM API
usage ~$5–20 → **≈ €25–40/month** at current scale.

---

## 2. Tech stack (pinned)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 LTS, pnpm | |
| Framework | Next.js 15.x, App Router, TypeScript `strict` | One app: subject UI + `/sanctum` + `/api` |
| Styling | Tailwind CSS v4 + CSS custom-property tokens | §6. shadcn/ui allowed in Sanctum only |
| DB | Postgres 16 + Drizzle ORM + drizzle-kit migrations | No Prisma engines; SQL visible |
| Jobs | pg-boss (Postgres-backed queues) | No Redis needed |
| Auth | Auth.js v5 (`next-auth@5`) with Patreon provider + DrizzleAdapter | §8 |
| Push | `web-push` (VAPID) | §14 |
| Media | Bunny Storage (private zones) + Bunny CDN token auth; `ffmpeg` in worker | §9 |
| Transcription | `faster-whisper` (medium, int8, CPU) in a FastAPI sidecar | §10 |
| LLM | `LLMProvider` interface; per-task provider config | §21 |
| State (client) | Zustand (player/queue), React Query for data | |
| Validation | zod everywhere (API inputs, LLM outputs, env) | |
| Tests | Vitest (unit) + Playwright (flows) | §25 |
| Deploy | Docker Compose via Coolify; GitHub → auto-deploy staging, manual promote prod | |

---

## 3. Repository layout

```
/docs                     BRAND.md FEATURES.md PLAN.md (this)
/src
  /app
    /(gate)               install+notification gate, age/consent (§13, A19)
    /(threshold)          public free zone (A18)
    /(subject)            library, player, programs, whispers, orders, polls,
                          collar card, vault, messages, commissions, settings
    /sanctum              admin cockpit (§17), middleware-gated
    /api                  route handlers (§23)
    /styleguide           hidden component catalog for the future design pass (D8)
  /components  /ui (primitives)  /player  /sanctum  /gate
  /copy        copy.ts — EVERY subject-facing static string, keyed (D8, BRAND.md)
  /lib         db/ (drizzle schema per domain)  auth  entitlements  patreon
               media  push  llm/ (provider iface + adapters)  offline  analytics
  /workers     index.ts + jobs/ (one file per job type, §22)
  /transcriber Dockerfile + main.py (faster-whisper FastAPI)
  /drizzle     migrations
  /public      manifest, icons, sw.js (built), spiral shaders, emergence.mp3
/scripts       seed.ts import-local.ts backup.sh
compose.yml    web worker transcriber postgres
.env.example   every var in §24, commented
```

**Conventions:** feature flags & tunables in `settings` table (ADMIN-CONFIG),
cached 60s. All subject-facing copy from `copy.ts` or DB templates — the future
design/voice pass edits those two places only. Every API input zod-validated.
Every LLM output zod-validated (retry once on parse failure). All timestamps
UTC in DB, rendered in subject's timezone.

---

## 4. Design-system contract (D8 — build now, restyle later)

- **Tokens** (`globals.css`): `--bg --surface --surface-raised --line --text
  --text-dim --accent --accent-soft --gold --danger --spiral-a --spiral-b`
  + type scale (`--font-display` serif, `--font-body` sans) + radii + spacing.
  Placeholder palette: near-black `#0B0A0E`, deep wine `#2A0E1E`, candle gold
  `#C9A227`, bone text `#EDE6DA`. Dark theme ONLY (no light mode).
- Components never use raw colors/fonts — tokens only. `/styleguide` renders
  every component in every state (the design pass works from this page).
- Motion defaults: slow (400–800ms), ease-out, breathing opacity loops;
  `prefers-reduced-motion` honored everywhere including spirals.
- Mobile-first; the PWA in a phone is the primary surface. Sanctum is
  desktop-first but must be usable on her phone.

---

## 5. Data model (Drizzle/Postgres — authoritative)

Types: `id` = uuid pk default random · `ts` = timestamptz · enums as pg enums.
`[idx]` = index. All tables get `created_at`, mutable ones `updated_at`.

### 5.1 Identity & access
```
users            id, role enum('subject','goddess') default 'subject',
                 chosen_name text, honorific text, pronouns text,
                 renamed_by_goddess bool default false,
                 timezone text default 'UTC', quiet_hours int4range default [22,9),
                 status enum('active','frozen','banned') default 'active',
                 last_seen_at ts [idx]
auth_*           Auth.js adapter tables (accounts holds patreon tokens)
patreon_links    user_id fk unique, patreon_user_id text unique [idx],
                 campaign_member bool, currently_entitled_tier_ids text[],
                 patron_status text, last_synced_at ts
tier_mappings    ADMIN-CONFIG: patreon_tier_id text unique, label text,
                 access_level int (0=threshold,1..n), sort int
entitlements     user_id fk [idx], access_level int, source enum('patreon','grant'),
                 status enum('active','grace','frozen'), grace_until ts null,
                 reason text  -- one active row per source; effective = max(active)
grants           user_id, track_id null, program_id null, granted_by, note
                 -- per-user unlocks (commission deliveries, gifts)
consents         user_id, kind enum('age','hypnosis_terms','privacy','theme_optout'),
                 payload jsonb, ts   -- append-only
devices          user_id [idx], platform enum('ios','android','desktop'),
                 push_subscription jsonb null, push_enabled bool,
                 installed bool, ua text, last_active_at ts
```

### 5.2 Content
```
tracks           id, title, slug unique, description, duration_s int,
                 storage_key text, stream_key text, artwork_key text null,
                 waveform jsonb null, min_access_level int default 1,
                 downloadable bool default true,           -- D4; ADMIN-CONFIG default
                 visibility enum('draft','published','archived') [idx],
                 kind enum('session','whisper_audio','emergence','spiral_audio'),
                 published_at ts, source enum('upload','patreon_import'),
                 patreon_post_id text null, fts tsvector [gin]  -- title+tags+transcript
transcripts      track_id fk unique, status enum('queued','processing','done','failed'),
                 language text, segments jsonb,  -- [{start,end,text}]
                 full_text text, model text, ADMIN-ONLY (never sent to subject clients)
tags             id, kind enum('purpose','theme','format','intensity','custom'),
                 value text, unique(kind,value)
track_tags       track_id fk, tag_id fk, source enum('agent','admin'), pk(track,tag)
triggers         id, name, slug unique, description, safety_notes text null
track_triggers   track_id, trigger_id, relation enum('installs','reinforces','requires'),
                 timestamps jsonb,  -- [{start,end,phrase}] from transcript
                 pk(track,trigger,relation)
user_triggers    user_id, trigger_id, acquired_via_track_id, acquired_at,
                 pk(user,trigger)   -- written on qualifying completion (§10.4)
programs         id, title, slug, description, artwork_key, min_access_level,
                 gating enum('sequential','daily','open'), visibility
program_items    program_id fk, track_id fk, day_number int, sort int
program_progress user_id, program_id, item_completed int[], current_day int,
                 started_at, completed_at null, pk(user,program)
playlists        id, title, description, visibility, kind enum('curated','system')
playlist_items   playlist_id, track_id, sort
review_queue     id, kind enum('tags','triggers','playlist','wish_cluster'),
                 subject_ref jsonb, proposal jsonb, agent_rationale text,
                 status enum('pending','approved','edited','rejected') [idx],
                 resolved_by, resolved_at
```

### 5.3 Listening & progression
```
listen_sessions  id, user_id [idx], track_id [idx], device_id, started_at,
                 ended_at null, seconds_listened int, max_position_s int,
                 completed bool,  -- ≥85% of duration
                 end_reason enum('finished','stopped','grounded','abandoned')
drop_reports     id, listen_session_id fk unique, user_id, track_id,
                 depth int (1..5), note text null, ts        -- A9
resume_points    user_id, track_id, position_s, pk(user,track)
chains           user_id pk, current_len int, best_len int, last_kept_date date,
                 timezone-aware daily boundary                -- A7
chain_events     user_id, date, kind enum('listen','mantra'), pk(user,date)
ranks            ADMIN-CONFIG: id, name, sort, rule jsonb     -- A6 (v1.1)
user_ranks       user_id pk, rank_id, achieved_at
milestones       user_id, kind enum('days_30','days_90','days_365','listens_100',
                 'program_done'), payload jsonb, surfaced bool, ts   -- A3
```

### 5.4 Presence & relationship
```
whispers         id, body text null, audio_track_id null, image_key null,
                 audience jsonb,  -- {type:'all'|'level'|'segment'|'users', ...}
                 published_at ts [idx], expires_at null       -- A11
whisper_receipts whisper_id, user_id, seen_at, knelt_at null, pk(whisper,user)
orders_          id, title, body, audience jsonb, due_at null,
                 requires enum('ack','text','none')            -- A12 (v1.1)
order_assignments order_id, user_id, status enum('sent','seen','done','lapsed'),
                 response text null, done_at, pk(order,user)
polls            id, question, options jsonb [{id,label}], audience jsonb,
                 closes_at ts, anonymous_to_admin bool default false,
                 results_shared bool default false, status enum('open','closed')  -- A24
poll_votes       poll_id, user_id, option_id, ts, pk(poll,user)  -- changeable until close
questions        id, prompt, audience jsonb, kind enum('intake','ritual'), sort  -- F9/F10
question_answers question_id, user_id, answer text, ts, pk(question,user,ts)
threads          id, user_id fk unique  -- one thread per subject (D7)
messages         id, thread_id [idx], sender enum('subject','goddess'),
                 body text null, audio_key null (A4), read_at null, ts,
                 flagged_safety bool default false             -- §15.10
ai_drafts        id, message_id fk (the subject msg being answered), drafts jsonb,
                 status enum('proposed','used','edited','discarded'), model text
voice_corpus     id, source enum('sent_reply','script','manual'), text, approved bool
wishes           id, user_id, body, source enum('intake','wishbox'), status
                 enum('new','clustered','planned','shipped','declined')   -- A15
wish_clusters    id, label, wish_ids uuid[], status, shipped_track_id null
commissions      id, user_id, answers jsonb, status enum('new','reviewing','accepted',
                 'in_progress','delivered','declined','closed'),
                 admin_notes text, delivered_track_id null, ts  -- D2/F3
commission_form  ADMIN-CONFIG: fields jsonb [{id,label,type,required,options}]
notifications    id, kind enum('manual','automation','system'), title, body,
                 deep_link text, audience jsonb, scheduled_for ts null,
                 sent_at null, created_by
notification_deliveries notification_id, user_id, device_id, status
                 enum('queued','sent','failed','clicked'), ts, pk(notif,user,device)
automation_rules ADMIN-CONFIG: id, trigger enum('inactive_days','new_track',
                 'program_day_unlocked','chain_broken','anniversary','lapse'),
                 params jsonb, template_id, enabled bool       -- A13 (v1.1)
templates        id, name, title_tpl, body_tpl  -- supports {name} {honorific} {track} …
settings         key pk, value jsonb  -- feature toggles & tunables (see §24.2)
audit_log        id, actor_user_id, action, subject jsonb, ts  -- every Sanctum mutation
analytics_events id, user_id null, name [idx], props jsonb, ts [brin]
offline_grants   user_id, track_id, device_id, key_wrapped text, expires_at,
                 revoked bool, pk(user,track,device)           -- D4/§12
```

---

## 6. Auth & entitlements (F1, A17, A21)

### 6.1 Subject sign-in
1. `Sign in with Patreon` → Auth.js Patreon provider, scopes
   `identity identity[email] identity.memberships`.
2. Callback: upsert `users` + `patreon_links` (patreon_user_id, entitled tier
   ids, patron_status). If `patreon_user_id == ADMIN_PATREON_USER_ID` → role
   `goddess`.
3. New subject → Gate flow (§13) → Initiation intake (§15.1) → Library.
4. Session: Auth.js JWT-in-encrypted-cookie, 30-day rolling. Store patreon
   refresh token in `accounts`; refresh access token on demand.

### 6.2 Entitlement resolution (pure function, unit-tested)
```
effective_access(user) =
  max( map(patreon currently_entitled_tier_ids via tier_mappings)  where status=active|grace,
       max(access_level of active 'grant' entitlements), 0 )
```
- `tier_mappings` is ADMIN-CONFIG (Sanctum → Access): she maps each Patreon
  tier to a level and label after connecting her campaign. Unmapped tier →
  level 1 + Sanctum warning banner.
- Track visible if `visibility=published` and (`min_access_level ≤
  effective_access` or per-user grant). Locked-but-visible tracks render
  sealed with upsell → her Patreon page (COPY `library.sealed`).

### 6.3 Sync: webhooks + reconciliation (R3)
- Patreon webhooks `members:pledge:create|update|delete` → `/api/patreon/webhook`
  (verify `X-Patreon-Signature` HMAC-MD5 with webhook secret) → enqueue
  `patreon-sync-user`.
- Nightly `patreon-reconcile`: page through campaign members with the creator
  access token (env), diff against `patreon_links`, enqueue per-user syncs.
  Patreon down → keep last-known entitlements (never mass-revoke on API error).

### 6.4 Lapse lifecycle (A17)
`active → grace` (pledge deleted/declined; `grace_until = now() +
settings.grace_days` default 3) `→ frozen`. Grace: full access + gentle
in-voice banner. Frozen: library seals, Collar Card shows chain/vault/rank
**preserved & frozen** + her voice note (COPY `lapse.frozen`) + resubscribe
link; offline blobs purge on next app-open (§12.4). Return → everything thaws
untouched.

### 6.5 Admin
- All `/sanctum/**` and `/api/sanctum/**` behind middleware: session role =
  `goddess`. Secondary check: patreon_user_id must equal env pin.
- Her devices also register for push (Sanctum alerts, §14.5).
- Every Sanctum mutation writes `audit_log`.

---

## 7. Media pipeline (F4, D9)

### 7.1 Storage layout (Bunny private zones)
```
media/originals/{trackId}/{filename}       — as uploaded (WAV/MP3/M4A)
media/stream/{trackId}.m4a                 — AAC 160k normalized rendition
media/art/{trackId}.webp                   — artwork
assets/spirals/*  assets/emergence.m4a  backups/…  (separate zone)
```
### 7.2 Ingest job (`media-ingest`)
Upload via Sanctum (tus-style chunked, ≤2GB) → originals → worker: ffmpeg →
duration; loudness normalize (EBU R128 −16 LUFS, ADMIN-CONFIG on/off) → AAC
160k `.m4a` (iOS-safe) → waveform peaks JSON (ffmpeg astats, ~1k points) →
`tracks` row draft → auto-enqueue `transcribe` (§10). Batch upload supported
(drag N files → N drafts).

### 7.3 Streaming (A22 baseline)
Bunny CDN **token authentication**: app issues per-request signed URLs
`{cdn}/stream/{id}.m4a?token=…&expires=now+6h`, bound to token key; CDN serves
Range requests natively (seek/resume). No public/guessable URLs; originals
zone is never exposed. Player fetches a fresh URL when one expires mid-session.
Fallback (settings flag) — app-proxied Range streaming for emergencies.

### 7.4 Patreon import & match (D9)
Sanctum → Import: (1) `patreon-import-posts` job pulls all campaign posts via
creator token (title, published_at, tier access, post id) → import rows.
(2) Patreon's API does not reliably expose attachment binaries — so she bulk-
uploads the same files (from laptop/exports); (3) matcher proposes
file↔post pairs (normalized-title fuzzy match + duration hints) → she confirms
in a two-column UI → track gets `patreon_post_id`, published_at backdated, tier
mapped to `min_access_level`. Unmatched uploads stay drafts; unmatched posts
listed as "missing file".

---

## 8. Transcription & Organize agent (D3, F5)

### 8.1 Transcriber sidecar
`POST /transcribe {url|path, language?}` → faster-whisper medium/int8 →
`{language, segments:[{start,end,text}], full_text}`. Queue-serialized (one at
a time, CPU); ~30-min file ≈ manageable minutes on CPX31 — batch overnight.
Audio never leaves the VPS for transcription (privacy, R4).

### 8.2 Script archive (her copy of every script)
Sanctum → Track → Script tab: full transcript, inline-editable (fix mishears),
export .txt/.md, copy button. `transcripts.full_text` feeds `tracks.fts`.
**Never shipped to subject clients** (her IP).

### 8.3 Organize agent (`organize-run`, F5)
Admin clicks **Organize** (all or selected tracks) → per track, LLM call with:
title, description, duration, full transcript, the existing canonical tag &
trigger vocabulary, program/playlist list. Output (zod-enforced JSON):
```
{ tags: {purpose[], theme[], format, intensity},
  triggers: [{name, relation: installs|reinforces|requires,
              evidence:[{start,end,phrase}], confidence}],
  playlist_or_program_suggestions: [{target, reason, day_number?}],
  new_vocab_proposals: [{kind, value, why}] }
```
→ rows in `review_queue`. **Nothing applies without her approval** (F5):
Sanctum review UI = per-track card, checkboxes per proposal, evidence snippets
with transcript timestamps, Approve / Edit / Reject; bulk-approve high-
confidence. Approved ⇒ `track_tags`, `track_triggers` (+ create canonical
`triggers`/`tags` from approved vocab proposals), playlist/program placements.
Re-runs are idempotent: agent sees current state, proposes deltas only.

### 8.4 Trigger Vault mechanics (A5, v1.1)
On `listen_sessions.completed=true` for a track with `installs` triggers →
upsert `user_triggers`. Library card shows READY / SEALED-BY-PREREQ per its
`requires` triggers vs the subject's vault (soft gate: warning + "Begin with
{track}" link; ADMIN-CONFIG hard/soft). Vault page: triggers held, source
file, date acquired.

### 8.5 Search & filters (F4)
Subjects: filter chips (purpose/theme/intensity/duration/program) + title
search. Sanctum: full FTS over transcripts+titles+tags with snippet highlights.

---

## 9. The Player (F6, A20)

Global singleton (Zustand store + one `<audio>` element at app root; UI is a
mini-bar everywhere + full-screen mode).

- **Queue:** play-now (playlist/program/track) · add-to-queue · play-next ·
  reorder (drag) · persists to localStorage + `resume_points` server-side.
- **End-of-track mode** — prominent selector in both mini and full UI:
  `continue queue · stop after this track · repeat track · repeat playlist ·
  sleep timer (15/30/60m/end-of-track)`. Default per BRAND: continue.
- **Full-screen trance mode:** spiral canvas (3 GLSL presets: classic spiral,
  888 double-spiral, breathing tunnel; ADMIN can upload more as video loops),
  intensity + speed sliders, artwork mode toggle. No strobe; photosensitivity
  note on first use; `prefers-reduced-motion` → static breathing gradient.
- **Media Session API:** lock-screen title/artwork/seek/skip; audio continues
  in background (PWA).
- **Grounding button (A20):** always visible in full-screen + settings. Tap →
  fade current audio over 2s → play `emergence` track (she records it; seeded
  asset) → clears queue → gentle "you're back" screen (COPY `ground.return`).
  Logs `end_reason='grounded'` (visible to her per-profile — a care signal).
- **Heartbeats:** every 10s while playing → batched `listen-progress` events →
  `listen_sessions` (drives A1 telemetry, completion, vault, drop-off
  analytics §19). Completion = ≥85% listened.
- **Drop report prompt (A9):** on `finished` (and once per session on stop ≥
  50%): depth 1–5 one-tap + optional note → `drop_reports`. Dismissible;
  never blocks playback; frames as *report for inspection* (COPY).

---

## 10. Offline downloads — "Keep with you" (D4)

YouTube-model: available offline **inside the app**, not as files.

1. Subject taps **Keep** on an entitled, `downloadable` track (or whole
   playlist/program) → `POST /api/offline/grant` → row in `offline_grants`
   with a per-user-device AES-256-GCM content key, wrapped by a device secret
   (random, generated at install, IndexedDB) — and a short-lived download URL.
2. SW fetches the `.m4a`, encrypts chunks with the content key, stores in
   IndexedDB (`offline-audio` store) + metadata (trackId, bytes, expires_at =
   now + `settings.offline_ttl_days` default 14). Foreground-only on iOS (no
   Background Fetch in Safari); show per-item progress; `navigator.storage.persist()`
   requested.
3. Playback offline: player fetch falls through to SW → decrypt stream →
   `<audio>` plays. UI shows the offline badge; Library has an **Offline**
   shelf; storage usage + remove per item in Settings.
4. **Revalidation & purge:** on every online app-open, sync grants — lapse to
   `frozen`, track unpublished, TTL passed, or logout ⇒ delete blobs + revoke
   grants. Offline use past TTL → track locks until next online check.
5. **Honesty note (for Akasha):** browser PWAs cannot do true DRM (no Widevine
   for us). This design means files never exist as normal downloads, are
   encrypted at rest, and expire — strong deterrence, same practical bar as
   most native apps without DRM licenses. Combined with signed streaming
   (§7.3) and v2 per-user watermarking (FEATURES A22), this is solid for her
   scale.

---

## 11. PWA shell & the Gate (F8)

- `manifest.webmanifest`: standalone, portrait, dark theme-color, icons
  (192/512/maskable), name "AKASHA".
- Service worker: app-shell precache (Workbox `injectManifest` — custom SW
  because of §10 and §14), runtime caching (art/images SWR; API network-first;
  audio cache-first only for offline store), `push` + `notificationclick`
  handlers (deep links), skip-waiting update flow with in-app "she has
  changed something" toast (COPY).
- **Gate flow** (first visit, and any visit while non-compliant), in-voice
  step screens (COPY `gate.*`):
  - Detect: standalone? platform? push permission? iOS version (UA + heuristic).
  - **iOS Safari, not installed:** full-screen instruction — Share →
    Add to Home Screen (animated hint) → "Open AKASHA from your home screen."
    Site does not proceed in-browser (F8). iOS <16.4 → apology-free fallback
    screen: update iOS to be claimed (COPY `gate.ios_old`).
  - **iOS installed, push off:** single button → `Notification.requestPermission()`
    from tap → subscribe → proceed. Denied → screen explaining Settings path,
    re-check on focus.
  - **Android Chrome:** `beforeinstallprompt` captured → custom install button
    → after `appinstalled`, request push → proceed. No prompt event (already
    installed) → just push.
  - **Desktop:** push required, install optional (F8).
  - Age/consent (A19) precedes everything: 18+ attestation, hypnosis terms
    (no listening while driving/operating machinery; not therapy/medical),
    privacy summary → `consents` rows. Theme opt-outs live in Settings.
- Gate state re-checked on every launch (`display-mode: standalone`,
  `pushManager.getSubscription()`); revoked permission → back to the relevant
  gate step.

---

## 12. Push notifications (F7)

- VAPID keys env-pinned. Subscriptions per device (`devices.push_subscription`);
  prune on 404/410 responses.
- **Composer (Sanctum):** title/body with `{name} {honorific} {chain} {track}`
  merge fields · deep link picker (track / program day / whisper / poll /
  commissions / custom path) · audience picker: all · access level ·
  segment (dynamic: inactive N days, chain ≥ N, program X in progress,
  intake answer contains…, top listeners) · individual(s) · schedule now/at ·
  preview on her own device button.
- Fan-out job `push-send`: expand audience → per-device sends, honoring
  **quiet hours** (subject-timezone; deferred to window end; ADMIN-CONFIG
  which kinds may override — safety/system only). Delivery + click tracking →
  `notification_deliveries` (feeds composer stats: sent/delivered/clicked).
- In-app inbox mirrors every push (iOS delivery isn't guaranteed — R2; the
  bell icon shows unseen count).
- **Sanctum alerts to her:** new message · new commission · poll closed ·
  milestone digest ready · import finished · agent run ready for review.
- Automations (A13, v1.1) reuse the same pipeline via `automation_rules` +
  `templates`; evaluator job runs hourly.

---

## 13. Relationship modules

### 13.1 Initiation intake (F9)
One question per full-screen step, her voice framing (COPY `intake.*`):
identification (name + honorific picks + pronouns) → since when known (date /
"found you via" options) → what do you seek most (choices + free text) →
favorite files so far (multi-select from catalog + free text) → what do you
wish existed (free text → `wishes(source='intake')`) → theme opt-outs →
consents recap. Writes `users`, `question_answers(kind='intake')`. Editable
later in Settings except consents (append-only).

### 13.2 Collar Card (A2)
Subject profile page + Sanctum-side mirror: chosen name/honorific ·
date claimed · chain (current/best) · rank (v1.1) · triggers held count ·
programs completed · listening hours. **Rename ritual:** Sanctum → profile →
rename → subject gets push + full-screen moment "You are {new name} now.
Because I say so." (COPY `rename.*`); old names kept in audit_log.

### 13.3 Chain of Obedience (A7)
A day is *kept* by ≥5 min listened (`settings.chain_min_seconds`) or typing
the daily mantra (ADMIN-CONFIG text, changeable) on the home screen. Broken →
`chain_events` gap; automation (v1.1) sends reclaim push (COPY `chain.reclaim`).
Home shows the chain as links, not a number counter (BRAND vocabulary).

### 13.4 Whispers (A11)
Sanctum composer: text ≤500 chars / audio (short upload, `kind='whisper_audio'`)
/ image; audience picker (same as push); optional expiry. Publishing enqueues
push ("She whispered." + deep link). Subject feed: reverse-chron cards, seen
receipts, single **Kneel** acknowledgment (no comments, D7). Her view: per-
whisper seen/knelt counts + names.

### 13.5 Orders (A12, v1.1)
Composer: title/body, audience, due, requires ack|text. Subject: Orders inbox
with states; done → chain credit for that day. Her board: completion roster
per order.

### 13.6 Polls (A24 — D6)
Sanctum: question + 2–8 options + audience (default **all**) + closes_at +
`anonymous_to_admin` flag + "share results when closed" default off. Publish →
push "She's asking. Answer." → full-screen vote (one tap; changeable until
close). Close (job at closes_at): results to Sanctum (counts, %, winner; voter
names per option unless anonymous) → optional one-tap **Share results** →
push + result card in subjects' Whispers feed (winner highlighted; COPY
`poll.results`). Votes append to profile timeline for her CRM view.

### 13.7 Ritual questions (F10)
Same composer/targeting pattern, free-text answer, appended to profile
timeline; her per-question answer browser with export.

### 13.8 Messages + AI assistant (F11, A4, A20)
- Subject: single thread with her; text (+ voice notes from her, A4 —
  recorded in Sanctum via MediaRecorder, stored as audio asset). Rate-limit
  ADMIN-CONFIG (default 5 msgs/day) with an in-voice limit line (COPY).
- Sanctum inbox: threads sorted by unread; **full Collar Card + timeline
  (intake answers, listening, reports, votes, wishes, commissions) beside the
  conversation** — she never answers blind.
- **Safety triage first:** every inbound runs a fast LLM classification
  (distress / crisis / age-doubt / none). Flags pin the thread to top with a
  red band "handle personally — no AI draft offered"; suggested grounding
  resources snippet available for her to adapt. (Classification-only — this
  runs on the mainstream provider fine, §21.)
- **AI drafts:** on her tap "Propose replies" → 3 drafts (short/medium/fuller)
  from: BRAND.md voice rules + `voice_corpus` (her approved past replies +
  script excerpts) + this thread + the subject's profile summary. She edits/
  sends/discards; **never auto-send** (enforced: send endpoint requires her
  session). Every reply she actually sends is appended to `voice_corpus
  (source='sent_reply', approved=true)` — the assistant converges on her real
  voice over time. Draft quality feedback = which draft used + edit distance
  (stored on `ai_drafts` for later tuning).

### 13.9 Milestones & anniversaries (A3, v1.1)
Nightly job computes `milestones`; Sanctum digest lists unsurfaced ones with
one-tap actions: personal push · whisper-to-one · nothing (dismiss).

---

## 14. Commissions (D2/F3/A14) & Wishlist (A15) & Threshold (A18)

### 14.1 Commissions
- Subject tab states by `settings.commissions_open` (ADMIN toggle, F3):
  **OPEN** → form; **CLOSED** → waitlist ("Commissions are sealed. Petition
  for a slot." COPY `comm.sealed`) — same form, flagged `waitlist`, notified
  FIFO when she reopens (A14).
- Form fields from `commission_form` (ADMIN-CONFIG editor: label, type
  [short/long/choice/multichoice], required, options, sort). **Seed fields**
  (Akasha aligns these with her Google Form in the editor — the form itself
  was not machine-readable from the build environment):
  1. How should she identify you (prefilled from Collar Card)
  2. Type of commission — personal hypnosis file / custom script / extended
     version of an existing file / video with spiral / other
  3. Theme & scenario — long text
  4. Triggers to install or include — long text
  5. Hard limits — what must NOT appear — long text, **required**
  6. Desired length — <15 / 15–30 / 30–60 / 60+ min
  7. Closest existing file(s) to what you crave — catalog multi-select
  8. Deadline or urgency — short text
  9. Budget range — choice (ADMIN-CONFIG options)
  10. Private to you, or may she release it publicly — strictly private /
      may publish / may publish renamed
  11. Anything else she must know — long text
- Submit → `commissions(new)` → Sanctum push + inbox card (answers rendered as
  a brief) → statuses `new → reviewing → accepted → in_progress → delivered →
  closed` (or `declined`, with in-voice template). Payment happens **off-app
  at launch** (D1): her acceptance message carries instructions (Patreon or
  her choice); v2 wires `PaymentProvider`.
- **Delivery:** attach finished track (visibility stays draft-private) →
  `grants` row for that subject → it appears in *their* library only, marked
  "Made for you." → push (COPY `comm.delivered`).

### 14.2 Wishlist pipeline (A15, v1.1)
Wish box on home ("Tell me what you crave." COPY) → `wishes`. Sanctum board:
new / clustered (LLM `wish-cluster` job proposes clusters → review_queue) /
planned / shipped. Shipping links a track → every wisher in the cluster gets
"You asked. I made it exist. Kneel." (COPY `wish.shipped`).

### 14.3 The Threshold (A18, v1.1)
Public marketing front (her links funnel here) → gate (§11) + Patreon sign-in
(works for non-patrons) → level-0 shelf: 1–2 free files + Day 1 of a chosen
program (ADMIN-CONFIG picks). All locked content visible-sealed with her
Patreon join link. Threshold users are full push subjects — her funnel.

---

## 15. Sanctum (admin) information architecture (F5 F7 F10 F11 + A-features)

```
/sanctum                 Today: unread messages, new commissions, digest,
                         listening-now, chain stats, agent runs awaiting review
/sanctum/library         tracks table (status, level, tags, plays, completion%)
                         · track editor (meta, artwork, level, downloadable,
                           Script tab §8.2, triggers, analytics §19)
                         · upload (batch) · import & match (§7.4)
/sanctum/organize        run agent · review queue (§8.3)
/sanctum/programs        program builder (items, day gating) /playlists
/sanctum/subjects        CRM list (search, segments, export) · profile: Collar
                         Card, timeline, entitlements, grants, devices, rename,
                         freeze/ban
/sanctum/messages        inbox (§13.8)
/sanctum/commissions     board + form editor + toggle (§14.1)
/sanctum/wishes          board (§14.2)
/sanctum/broadcast       push composer + history/stats (§12)
/sanctum/whispers        composer + receipts (§13.4)
/sanctum/orders          (v1.1) /sanctum/polls (§13.6) /sanctum/questions
/sanctum/automations     rules + templates (v1.1)
/sanctum/analytics       §19 dashboards
/sanctum/access          tier mappings, grace days, feature toggles, gate copy,
                         commission toggle mirror, offline TTL, chain settings
/sanctum/audit           audit log
```

---

## 16. Analytics (A1 + her content science, internal-only — A21)

Events (`analytics_events` + rollup tables, no third-party trackers):
`app_open listen_start listen_heartbeat listen_complete grounded download_kept
notification_sent/clicked chain_kept chain_broken poll_vote whisper_seen/knelt
message_sent commission_submitted wish_submitted intake_completed`.

Dashboards:
- **Per track:** plays, unique listeners, completion %, replay rate, mean
  depth (drop_reports), **drop-off curve** (histogram of max_position_s /
  duration — where trance breaks, her sharpest writing tool), grounded count.
- **Per subject (in CRM):** last seen, hours, favorite tags (computed),
  chain, depth trend — powering A1 "seen" touches (one-tap personal push from
  any row).
- **Platform:** DAU/WAU, gate conversion funnel (visit→installed→push→intake),
  push CTR, Threshold→patron conversion (v1.1), churn/win-back (A17).
- Daily digest job → Sanctum Today + optional push to her.

---

## 17. LLM provider abstraction (§8.3, §13.8, §14.2)

```ts
interface LLMProvider { complete(task: TaskKind, input: object): Promise<object> }
// adapters: anthropic (default), openrouter, local (vLLM) — env-selected per task:
// LLM_TASK_ORGANIZE=anthropic  LLM_TASK_TRIAGE=anthropic
// LLM_TASK_DRAFTS=openrouter:<adult-permissive-model>  LLM_TASK_CLUSTER=anthropic
```
- Organize/tagging, safety triage, clustering = analysis/classification →
  default **Claude API** (`claude-sonnet-5` class model; economical, strong
  structured output).
- **Reply drafting** generates text in her intimate femdom register — provider
  content policies differ; route it per-env to a model/provider whose terms
  permit erotic creative text (a permissive model via OpenRouter, or
  self-hosted open-weights later). The interface makes this a config choice, not a
  rebuild. Prompts live in `/src/lib/llm/prompts/*.ts` with BRAND.md inlined
  as the system preamble for drafting tasks.
- All outputs zod-parsed; one retry with error feedback; failures land in
  review_queue as `failed` for visibility. Per-task token/cost counters →
  Sanctum analytics.

---

## 18. Background jobs (pg-boss queues)

| Job | Trigger | Does |
|---|---|---|
| media-ingest | upload complete | ffmpeg pipeline §7.2 |
| transcribe | after ingest / manual | sidecar call → transcripts §8.1 |
| organize-run | admin button | LLM pass → review_queue §8.3 |
| patreon-sync-user | webhook / login | refresh one member's entitlements |
| patreon-reconcile | nightly cron | full member diff §6.3 |
| patreon-import-posts | admin button | §7.4 |
| push-send | composer/automation | fan-out with quiet hours §12 |
| poll-close | at closes_at | tally, notify her, optional share §13.6 |
| milestones-daily | nightly | A3 detection + digest |
| automation-eval | hourly (v1.1) | rules §12 |
| wish-cluster | admin button (v1.1) | §14.2 |
| offline-audit | daily | expire/revoke grants §10.4 |
| analytics-rollup | hourly | event → rollup tables |
| backup | nightly | §20 |

---

## 19. API route map (all zod-validated; subject routes require session; sanctum routes require goddess)

```
auth: /api/auth/[...nextauth]
gate: POST /api/devices (register/update, push sub)  POST /api/consents
subject:
  GET /api/library  GET /api/tracks/:id (meta only)  GET /api/tracks/:id/stream-url
  GET/POST /api/programs/:id/progress
  POST /api/listen/heartbeat (batched)  POST /api/listen/end  POST /api/drop-report
  GET /api/whispers  POST /api/whispers/:id/kneel
  GET /api/polls/open  POST /api/polls/:id/vote
  GET /api/orders  POST /api/orders/:id/respond          (v1.1)
  GET /api/questions/pending  POST /api/questions/:id/answer
  GET/POST /api/thread (messages)  POST /api/wishes
  GET /api/commissions/form  POST /api/commissions
  POST /api/offline/grant  POST /api/offline/sync
  GET/PATCH /api/me (settings, timezone, quiet hours, theme opt-outs)
patreon: POST /api/patreon/webhook
sanctum: mirrors §15 — /api/sanctum/{tracks,transcripts,organize,review,
  programs,playlists,subjects,grants,rename,messages,drafts,commissions,
  commission-form,wishes,broadcast,whispers,polls,questions,orders,
  automations,templates,analytics,access,settings,import,audit}
cron-internal: worker-only, not HTTP
```

---

## 20. Security, privacy, ops (A21, A22, R4)

- HTTPS only (Coolify/Traefik + LE), HSTS; strict CSP (self + bunny CDN host;
  no third-party scripts at all); secure/httpOnly/SameSite=Lax cookies; CSRF
  via Auth.js; rate limits (login, messages, wishes, commissions) in Postgres.
- Data separation: kink-profile tables reference `users.id` only; email lives
  solely in auth tables; exports/deletes: Settings → "Export my data" (JSON
  zip job) and "Release me" (delete account: hard-delete profile/relationship
  rows, purge devices/subscriptions; audit stub retained) — GDPR.
- DB encrypted at rest (VPS volume LUKS or provider encryption); Bunny zones
  private + token-auth only; `.env` secrets only via Coolify.
- Backups: nightly `pg_dump | age -e` → Bunny backups zone (separate access
  key), 30-day retention; weekly restore drill documented in `scripts/backup.sh`
  header. Media originals already off-VPS (Bunny replication).
- Uptime monitoring: healthcheck route + external ping (her choice of free
  service); worker heartbeat row surfaced in Sanctum Today if stale.
- Legal pages: /terms (hypnosis disclaimers: for adults; a practice, not
  medical or therapeutic treatment — this wording protects her from
  unlicensed-practice claims; never listen while driving or operating
  machinery), /privacy, 18+ interstitial (A19 — matches her Patreon's own
  18+ setting). Age-verification provider hook left as an interface for
  jurisdictions that may require it later (R5).

---

## 21. Environment variables (`.env.example`)

```
APP_ORIGIN=                      # https://obeyakasha.com (D10)
DATABASE_URL=
AUTH_SECRET=
PATREON_CLIENT_ID= PATREON_CLIENT_SECRET=
PATREON_CREATOR_ACCESS_TOKEN=    # for reconcile/import (§6.3, §7.4)
PATREON_WEBHOOK_SECRET=
ADMIN_PATREON_USER_ID=           # pins the goddess role
VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=mailto:…
BUNNY_STORAGE_ZONE= BUNNY_STORAGE_KEY= BUNNY_CDN_HOST= BUNNY_TOKEN_KEY=
TRANSCRIBER_URL=http://transcriber:8000
ANTHROPIC_API_KEY=               # organize/triage/cluster
OPENROUTER_API_KEY=              # drafting (model permitting erotic text)
LLM_TASK_ORGANIZE= LLM_TASK_TRIAGE= LLM_TASK_CLUSTER= LLM_TASK_DRAFTS=
BACKUP_AGE_RECIPIENT=
```

**Key `settings` rows (ADMIN-CONFIG, seeded):** `commissions_open`,
`grace_days=3`, `offline_ttl_days=14`, `chain_min_seconds=300`,
`chain_mantra`, `msg_daily_limit=5`, `normalize_loudness=false`,
`downloads_enabled=true`, `vault_gating=soft`, `threshold_track_ids=[]`,
`quiet_hours_default=[22,9]`.

---

## 22. Testing strategy

- **Unit (Vitest):** entitlement resolution (§6.2 — exhaustive cases: multi-
  tier, grace, frozen, grants), audience expansion (segments), quiet-hours
  scheduling, chain day-boundary math (timezones!), zod schemas, LLM output
  parsing fixtures, offline grant lifecycle.
- **Integration:** Patreon webhook signature + sync against recorded fixtures;
  push fan-out against a mock endpoint; ingest pipeline against a tiny mp3.
- **Playwright:** gate flow (mock UA/permission states) → intake → library →
  play → queue/end-modes → drop report; sanctum: upload → organize (mock LLM)
  → review-approve → publish → broadcast; poll round-trip; commission round-
  trip; offline keep + airplane-mode playback (Chromium offline emulation).
- CI (GitHub Actions): typecheck, lint, unit+integration, Playwright headless,
  drizzle migration check. Green CI = deployable.

---

## 23. Milestones (build order; each ends deployed to staging + checklist green)

**M0 — Foundations (F1, §3–6):** scaffold, tokens+styleguide, schema+
migrations, Patreon OAuth + sessions, goddess role, tier-mapping UI,
entitlement engine + tests, Coolify deploy (staging domain), CI.
*DoD: she signs in with Patreon on staging; her tiers appear; mapping editable; audit log works.*

**M1 — Media core (F4 F6, §7 §9):** upload+ingest, Bunny streaming, library
(filters/sealed states), player complete (queue, end-modes, spirals,
grounding, resume, media session), programs + gating, listen telemetry +
drop reports, resume points.
*DoD: full listen loop on a phone from staging with real files; drop-off data lands.*

**M2 — PWA + push (F7 F8, §11–12):** manifest+SW, gate flows (iOS/Android/
desktop), consents, devices, VAPID push, composer v1 (all/level/individual +
{name}), in-app inbox, quiet hours.
*DoD: iOS 16.4+ phone completes the gate, receives a targeted push, deep-links to a track.*

**M3 — Intelligence (D3 F5, §8):** transcriber sidecar, transcribe pipeline,
Script tab, organize agent + review queue, tags/filters live, FTS, trigger
extraction (data model populated; vault UI later).
*DoD: she uploads 3 real files → transcripts appear → Organize proposes tags/triggers with evidence → approve → library filters work.*

**M4 — Relationship core (F9 F10 F11 A1 A2 A7 A9 A11 A24):** intake, Collar
Card + rename ritual, chain, whispers + kneel, polls end-to-end, ritual
questions, messages + voice notes + safety triage + AI drafts + voice corpus,
CRM profiles + "seen" one-tap pushes, Sanctum Today.
*DoD: full loop — subject onboards, listens, reports, votes, messages; she answers via edited AI draft; profile timeline shows everything.*

**M5 — Commissions + offline (D2 D4 A14, §10 §14.1):** commission form
editor + seed, request flow + statuses + private delivery via grants,
waitlist mode, offline Keep (grants, encryption, revalidation, purge),
lapse grace/frozen states (A17).
*DoD: commission round-trip incl. private delivery; airplane-mode playback; frozen account seals and purges offline, thaws intact.*

**M6 — Scale her presence (v1.1 set: A3 A5 A6 A12 A13 A15 A18):** milestones
digest, Trigger Vault UI + prereq gating, Descent ranks, Orders, automations
+ templates, wish clustering + board, Threshold free zone + funnel analytics.
*DoD: automations fire on schedule; vault gates correctly; Threshold converts a fresh non-patron account.*

**M7 — Hardening & launch (§16 §20):** analytics dashboards complete, data
export/delete, backups + restore drill, rate limits, CSP audit, legal pages,
perf pass (LCP < 2.5s on mid phone), content seed (her real catalog via
import & match), **launch checklist:** buy domain → point DNS → Patreon
client + webhook to prod origin → VAPID prod keys → Bunny prod zones → she
records emergence track + gate/lapse voice notes → tier mapping set → invite
patrons via Patreon post.
*DoD: production live on obeyakasha.com with her full catalog; first patrons through the gate.*

**v2 backlog (explicitly out of scope now):** `PaymentProvider` (CCBill/
Segpay) for direct subs/tributes/commission checkout · per-user audio
watermarking · presence counter ("N subjects are under right now") · age-
verification provider integration · native wrapper (Capacitor) if iOS PWA
push ever becomes limiting.

---

## 24. Notes for the builder

1. **BRAND.md is law for every string.** When writing COPY keys, write real
   in-voice copy (she edits later in one file / DB templates) — never
   lorem-ipsum, never generic app-speak ("Success!", "Oops!").
2. Prefer boring, long-lived libraries; no experimental deps. Everything must
   run in plain Docker on one VPS.
3. Any ambiguity: implement the simplest version **behind an ADMIN-CONFIG
   setting**, note it in `docs/DECISIONS.log.md` (create it; append-only), and
   move on — do not block.
4. Never expose: transcripts to subjects, other subjects' existence (names,
   counts, receipts) to any subject (D7 — the only future exception is the
   opt-in v2 presence counter), raw storage URLs, or LLM provider names in UI.
5. Keep `docs/` updated as you build: PLAN.md deltas via DECISIONS.log.md,
   schema changes via migration files — the docs are the product's memory.
```
