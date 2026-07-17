# Roadmap v1.5 — Content Foundation & Player v2

> Status: **proposed** (Akasha review). Architecture + specs authored by the
> planning model; implementation is delegated to lower-cost execution models
> per module, each working from the specs below, with integration + review by
> the planner. Read after PLAN.md; log deviations in DECISIONS.log.md.

## Why (Akasha's feedback, 2026-07-12)

1. Uploading shows **no progress bar** and the Sanctum **blocks until a manual
   refresh** (uploads run through server actions → no progress events;
   transcription is fire-and-forget with no status watcher; pages revalidate
   only on navigation).
2. She wants **import-everything, organize-everything automatically** — drop
   the whole catalog in and walk away.
3. The player should feel **like Spotify** — advanced, personal.
4. **Nothing lost.** Every transcribed track gets its own **page** showing the
   transcript, the keywords found, and the triggers detected — so she can
   *approve* each into real tags and *place* the track into a training or
   series. She wants a **full data-management system with a great agent doing
   the heavy work**, heavy analysis handed to **Opus 4.8**, inspired by
   shibbydex.com's per-file pages — but better, because we own the player.
5. **Import from Patreon, not YouTube.** Pull her posts (titles + descriptions
   + audio attachments) straight from her Patreon page, with the option to
   rewrite descriptions in her voice.

Priority: content foundation first (C1) → data management (D) → Patreon
import (I) → Whispers (W) → player (P1→P3).

---

## Phase C1 — Content Foundation

**DoD:** drag 30 files into the Sanctum → per-file progress bars → walk away →
return to a transcribed, tagged, playlist-proposed, publish-ready library,
with statuses updating live the whole time. No page refreshes anywhere.

### C1.1 Durable job queue (worker)

- New `jobs` table: `id uuid pk, kind text, payload jsonb, status
  enum(queued|running|done|failed), attempts int default 0, max_attempts int
  default 3, run_at timestamptz default now(), last_error text, created_at,
  updated_at`. Index on (status, run_at).
- `enqueue(kind, payload, opts?)` in `src/lib/jobs/queue.ts`; worker polls
  every 3s with `FOR UPDATE SKIP LOCKED`, per-kind concurrency:
  `transcribe: 1` (CPU-bound), `organize: 2`, `ingest-finalize: 2`.
  Failed jobs retry with backoff (1m, 5m, 15m) up to max_attempts.
- Existing fire-and-forget calls (`transcribeTrack`, `organizeTrack`) become
  job handlers; the web process only enqueues. Survives restarts.

### C1.2 Real uploads (progress, multi-file, streaming)

- New route `POST /api/sanctum/upload` (goddess-gated): accepts one file as a
  raw streamed body (`?filename=&title=&durationS=`), streams to a temp file
  (never buffers whole file in memory), then hands to `ingestUpload` (which
  gains a path-based variant). Response: `{trackId}`.
- Client `UploadQueue` component (Sanctum Library): multi-select + drag-drop
  (incl. folder via `webkitdirectory`), XHR per file for
  `upload.onprogress`, concurrency 2, retry button on failure, per-file bar +
  state chip. Client probes duration before upload via `<audio>` metadata so
  no ffprobe dependency.
- Remove the old server-action upload path.

### C1.3 Auto-pipeline

- Track gains `pipeline` status column:
  `uploaded → transcribing → organizing → ready | failed_transcribe |
  failed_organize` (migration; backfill existing rows to `ready`).
- Setting `auto_pipeline` (default **on**): ingest completion enqueues
  `transcribe`; transcribe success enqueues `organize`.
- Setting `organize_auto_apply` (three-way, Sanctum → Access):
  - `review_all` — everything waits for approval (old behavior)
  - `tags_only` — **default**: tags + playlist placements apply
    automatically; trigger proposals still queue for review (safety-relevant)
  - `everything` — full auto; the Organize page becomes an undo/curate surface
  Deviation from F5's nothing-auto-applies is logged; it's her explicit ask,
  and it stays her dial.
- Auto-apply reuses `applyReview` (already idempotent).

### C1.4 Reactive Sanctum Library

- `GET /api/sanctum/tracks` returns the full library table (id, title, status,
  pipeline, level, transcript status, tag count, plays).
- Library page becomes client-driven: a `usePolling` hook (2.5s while any row
  is in a working state, 15s idle, pauses when tab hidden) keeps statuses
  live; publish/edit/transcribe/organize actions call APIs and update rows
  optimistically — **zero full-page refreshes**.
- Batch bar: select-all/some → Transcribe / Organize / Publish / Set level.
- Inline edit stays (details drawer), now submitting via fetch + optimistic
  update. Global toast for job completions ("Transcribed: <title>").
- (Upgrade path later: SSE endpoint replacing polling; not needed at this scale.)

### C1.5 YouTube importer (optional — Akasha's call)

- Paste a channel/playlist/video URL → worker job `yt-import` runs `yt-dlp`
  (added to worker image) to fetch **her own** audio → each file enters the
  normal pipeline with title from YouTube. Flagged behind setting
  `yt_import_enabled` (default off). Note: fetching your own uploads via
  yt-dlp technically brushes YouTube ToS — her call to enable; content is hers.

---

## Phase D — Track Data Management ("nothing lost")

The heart of this request. Today a track is a row and an audio file; after
transcription the words, the keywords, and the triggers exist only long enough
to become review-queue proposals, then evaporate. Phase D makes every track a
**durable dossier** — a page that keeps everything the agent ever found, lets
her approve findings into canonical tags/triggers/placements one tap at a time,
and never throws a discovery away. Model: shibbydex.com's per-file pages
(description · intended effects · categorised tags · length · versions ·
recommendations), plus the one thing shibbydex can't do — **we own the player**,
so every trigger and keyword links straight to the exact second it's spoken.

**DoD:** open any track → read its full transcript, see every keyword and
trigger the agent found (each with play-from-timestamp), approve the good ones
into tags/triggers with one tap, drop the track into a training or series,
rewrite its description in her voice — and know that nothing the agent ever
surfaced was lost, even the parts she didn't approve.

### D1 Durable analysis store (nothing is thrown away)

- New table `track_analysis` (one row per track, upserted by the agent):
  `track_id uuid pk→tracks, model text, keywords jsonb, triggers jsonb,
  suggested_tags jsonb, suggested_description text, intended_effects jsonb,
  safety_notes text, summary text, raw jsonb, created_at, updated_at`.
  - `keywords`: `{ phrase, category(fetish|descriptive|hypnosis_type|state),
    salience(0..1), tagKind, evidence:[{start,end}] }[]` — category mirrors
    shibbydex's grouping; `tagKind` pre-maps to our `tag_kind`
    (theme/purpose/format/intensity/custom) so approval is one click.
  - `triggers`: superset of the current `triggerProposalSchema` (name,
    relation, evidence timestamps, confidence) + `phrase` and
    `suggestedSafetyNotes`.
  - This row is **permanent and admin-only**; it is the "nothing lost" ledger.
    Approving a finding never deletes it here — it just flips a
    `status: proposed|approved|dismissed` on that entry (kept in `raw`/jsonb),
    so a dismissed keyword can be reconsidered later.
- The existing `review_queue` still receives proposals (so the batch Organize
  page keeps working), but `track_analysis` is now the source of truth the
  dossier reads from. `applyReview` and dossier-approve share one apply core.

### D2 The Track Dossier — `/sanctum/tracks/[id]` (goddess-gated)

A single scroll, shibbydex-shaped, her-voiced, editorial-occult styled:

1. **Header / identity.** Editable title, slug, artwork, `kind`, `minAccessLevel`,
   `visibility`, `downloadable`; read-outs for duration, source
   (upload/patreon_import), plays, devotions, pipeline status. Inline edits
   save via fetch + optimistic update (no refresh), each `logAudit()`'d.
2. **Description.** Rich editable field with an **"in her voice" rewrite**
   button (agent draft → she edits → save). The pre-rewrite text is preserved
   in `track_analysis.raw.originalDescription` — nothing lost.
3. **Transcript** (admin-only, never shipped to subjects — CLAUDE.md privacy).
   Full text + timestamped segments, in-page search, copy, and **re-run
   transcription**. Each segment has a ▸ to play the track from that second.
4. **Keywords.** Every phrase the agent found, grouped by category
   (fetish · descriptive · hypnosis-type · state), each showing salience and a
   ▸ play-from-evidence. One-tap **Approve → tag** creates/links the `tags`
   row with the pre-mapped `tag_kind` and `source='agent'`; **Dismiss** keeps
   it in the ledger, greyed. Manual "+ add tag" too.
5. **Triggers.** Detected triggers with relation (installs/reinforces/requires),
   confidence, and **evidence chips that play the exact passage** — her verify
   loop. Approve → writes `track_triggers` (+ creates the `triggers` row if new)
   with the evidence copied into `track_triggers.timestamps`. Safety-relevant,
   so these **always** require her tap (never auto-applied, even under
   `everything` mode from C1.3).
6. **Placement.** Add to **training** (`programs` → `program_items`, with
   day/sort) and **series/collection** (`playlists` → `playlist_items`);
   shows current memberships with remove/reorder. This is her "add to a
   training or a series" ask, made first-class.
7. **Versions / variants** (shibbydex parity). Group related renders of one
   work — binaural, music-bed, no-background, extended, SFW-teaser. New
   `track_variants (group_id uuid, track_id uuid, variant_label text,
   sort int)`; the dossier shows sibling variants and lets her link/label them.
   The player later offers a variant switcher on one logical track.
8. **Recommendations / chains** (shibbydex "file chains"). Ordered "listen
   next" edges via new `track_relations (from_track, to_track, kind
   enum(next|related|prerequisite), sort)`. Agent proposes; she curates. Feeds
   Player v2's autoplay + the subject file page's "after this" rail.

### D3 The heavy agent (Opus 4.8 does the thinking)

- New job kind `analyze` (added to C1.1's queue), enqueued after `transcribe`
  succeeds and before/with `organize`. Handler in `src/lib/analyze/run.ts`.
- **Tiered model routing** so cost tracks difficulty ("think Fable, execute
  lower, heavy → Opus"):
  - Setting `analysis_model` (default `opus-4.8`) names the heavy model; a
    `analysis_model_light` (default a haiku-class model) handles short tracks /
    re-runs. Router picks by transcript length + whether triggers are suspected.
  - The local `heuristicOrganize` stays as the **always-on floor** — if the LLM
    is disabled or errors, the dossier still fills from heuristics. LLM output
    is merged over heuristics, never replacing evidence-timestamps the
    heuristic found by scanning segments.
- One structured call returns the whole dossier (keywords + triggers +
  description rewrite + intended effects + safety notes + suggested placements
  + recommendations), validated by a single zod schema
  (`src/lib/analyze/schema.ts`, superset of `organizeProposalSchema`). Invalid
  → one repair retry → fall back to heuristic-only, and mark
  `track_analysis.model='heuristic'` so she knows.
- Prompt is built from `OrganizeInput` + known triggers + her tag vocabulary,
  and instructed in Akasha's brand voice for any prose (description/effects).
  Provider name never surfaces in UI (CLAUDE.md privacy).

### D4 Subject-facing file page (the shibbydex payoff, safely)

- Public per-track page `/library/track/[slug]` for subjects: artwork, her
  **approved** description + intended effects, **approved** tags (as filters),
  length, required/installed triggers *by name only*, variants switcher, and a
  big **play/queue** CTA + an "after this" rail from `track_relations`.
- Hard privacy line: **transcript, keywords, agent rationale, salience, and any
  dismissed/unapproved finding never render here.** Only what she approved, and
  never another subject's presence (D7). This is the shibbydex file page — but
  with our player, "play" is one tap, not a link out.

---

## Phase I — Patreon Importer ("bring the catalog home")

Her real catalog lives on Patreon. Import posts **with their titles and
descriptions and audio**, dedupe against what's already here, and drop each into
the C1 pipeline so it lands as a fully-analysed dossier. Not YouTube — Patreon.
The schema already anticipated this: `tracks.source='patreon_import'` and
`tracks.patreon_post_id` exist today.

### I1 Client — read her posts

- Extend `src/lib/patreon/client.ts` with `fetchCampaignPosts(accessToken,
  cursor?)` → `GET /campaigns/{id}/posts?include=attachments_media` with
  `fields[post]=title,content,url,published_at,is_public` and
  `fields[media]=download_url,file_name,mimetype,size_bytes`. Cursor pagination;
  tolerant JSON:API parsing like the existing helpers. Returns
  `{ posts: {postId,title,contentHtml,url,publishedAt,audio:
  {downloadUrl,fileName,mime,bytes}[] }[], nextCursor }`.
- Uses the creator access token (same token infra as `fetchCampaignTiers`).
  Token stays in gitignored env / settings, never in the repo; **rotate the
  chat-exposed secret before launch** (open security item).

### I2 Import surface (Sanctum → Content → Import from Patreon)

- Lists her posts newest-first: title, published date, an **audio?** chip, and
  an **imported?** chip (dedupe on `patreon_post_id`). Checkbox select + "select
  all new" → enqueues `patreon-import` jobs (C1.1 queue). Posts with no audio
  attachment are shown but not selectable for track import (could still seed a
  Whisper later).

### I3 Import job

- `patreon-import` handler: for each selected post → download each
  `attachments_media` audio via its `download_url` (streamed to temp, never
  fully buffered — mirrors C1.2) → hand to `ingestUpload` (path variant) →
  create `tracks` row with `source='patreon_import'`, `patreon_post_id` set,
  `title` from the post, `description` = HTML→text of `content`, `visibility`
  starts `draft`. Then enqueue the normal `transcribe → analyze → organize`
  chain. Idempotent on `(patreon_post_id, file_name)`.
- The **original** Patreon title + HTML description are preserved in
  `track_analysis.raw` before any rewrite (nothing lost).

### I4 Description rewriting

- At import (bulk) and on the dossier (per-track): **"rewrite in her voice"**
  runs the D3 agent on the imported description, producing a clean, in-brand
  version she approves/edits. Original kept. Batch action: "rewrite all
  imported descriptions" queues per-track `analyze` prose passes.

### I5 Auto-import (optional, her dial)

- Setting `patreon_auto_import` (default **off**): a nightly worker job polls
  `fetchCampaignPosts`, imports any new post with audio automatically, and (if
  `auto_pipeline` on) runs the whole chain — "drop it on Patreon, find it here
  organised." New tracks land `draft` so nothing publishes without her.

### New settings (Phase D + I)

```
analysis_model         default "opus-4.8"     # heavy dossier analysis
analysis_model_light   default "haiku-class"  # short tracks / re-runs
analysis_enabled       default true           # LLM pass on/off (heuristic floor stays)
patreon_import_enabled default true
patreon_auto_import    default false
```

---

## Phase W — Whispers Feed ("her timeline")

Akasha's ask: the Whispers tab should feel like a real feed — x.com-like —
where she expresses thoughts, posts images, gives commands; everything posted
goes out through push. It stays strictly **one-way** (D7): no comments, no
subject posts — her voice, their kneeling.

- **Composer (Sanctum + inline at top of her own feed view):** one box, four
  attachment modes —
  1. *Thought* — text up to 500 chars, line breaks preserved
  2. *Image* — upload via the C1.2 upload route (stored under `whispers/` in
     the media provider, served through signed URLs like artwork)
  3. *Track* — attach a library track; renders as an inline playable card
     ("She wants you under this.") that feeds the normal player/queue
  4. *Command* — text styled as an order (gold-edged, OBEY chip); creates a
     real `orders` row targeted at the same audience, so subjects get an
     inline **Obey/Done** button in the feed and completion credits the chain
  Audience picker (all/level/one) as today; publishing always broadcasts push.
- **Feed rendering (subject):** avatar (her sigil) + relative time ("2h") +
  text/image/track/command cards; infinite scroll (cursor pagination, 20/page);
  images lazy-loaded; pull-to-refresh feel via the polling hook.
- **Kneel** stays the only reaction — now with a visible **count** ("23 knelt")
  as ambient co-presence; counts only, never names (D7-safe).
- Her view of each post keeps seen/knelt totals + per-name list (Sanctum only).

---

## Phase P — Player v2 ("Spotify-grade, but hers")

### P1 Core controls (table stakes; biggest daily-feel win)

- **Seek**: draggable scrub bar in fullscreen (with time preview) + tap-to-seek
  progress strip on the mini-player; buffered-range indicator.
- **±15s skip** buttons (fullscreen + lock-screen via Media Session
  `seekbackward/seekforward/seekto` handlers) — hypno listeners re-hear
  passages constantly.
- **Queue sheet** — modeled on the proven Spotify/Apple Music pattern so it
  feels instantly familiar:
  - Bottom sheet opened from a queue icon on the mini-player and fullscreen;
    drag-down or scrim-tap to dismiss.
  - **Now** pinned at top (art/title, subtle pulse when playing).
  - Two labeled groups, exactly like Spotify: **"Next in queue"** (tracks the
    subject manually queued — these always play first) and **"Next from:
    <source>"** (the rest of the playlist/program/shelf they started). The
    store tracks `manualQueue` vs `sourceQueue` + `sourceName` to make this
    real, not cosmetic.
  - Row interactions: drag-handle reorder (long-press on mobile), swipe-left
    or ✕ to remove, tap to jump-play. "Clear queue" affects manual items only.
  - Every "+ queue"/"play next" action fires a small toast ("Queued: <title>")
    so adding never feels like a dead click.
  - Empty state in her voice ("Nothing waits. Choose what owns you next.").
- **Volume slider** (desktop fullscreen; phones use hardware).
- Store changes: `seekTo(positionS)` bridged to the audio element via a
  request-ref (UI never touches the element directly), `reorderQueue`,
  buffered state.

### P2 Personalization

- **Devotions** (favorites, in-voice: "it owns me"): heart-as-collar toggle on
  rows + fullscreen; `user_favorites (user_id, track_id, created_at)`;
  Devotions shelf in Library; count surfaces in her CRM/analytics (which
  files create devotion — better signal than plays).
- **For-you shelves** (Library home, computed per subject, plain SQL):
  1. Continue listening (exists)
  2. *Back under* — their most-replayed
  3. *Deeper cuts* — unheard tracks whose tags match their top-listened tags
  4. *Her latest* — newest published
- **Autoplay beyond the queue** (subject setting, default on): when the queue
  ends in `continue` mode, fetch 3 recommendations (same top tags, unheard
  first) and keep going — Spotify's "keep playing" feel.

### P3 Atmosphere (the trance edge Spotify can't do)

- **Crossfade** (subject setting 0–12s): two-element audio engine swap with
  equal-power fade between queue items — seamless descent, no jarring gaps.
- **Ambient bed**: optional low layer under the voice (rain, drone, room tone)
  from tracks she uploads as `kind=spiral_audio`; subject picks bed + level in
  fullscreen ("the room"), persisted per subject. Second looping audio
  element; ducks during grounding.

Explicitly skipped: playback speed (pitch ruins trance), lyrics/transcript
view (her IP, never shown), social/collaborative queues (D7).

---

## v2 RESHAPE (approved 2026-07-17) — supersedes tab/IA parts above

Approved by Akasha after research (Shibbydex v2 file pages/playlists/player;
Mistress Calia free-funnel catalog; Shelle Rivers contract + monthly gifts).
**Build order is R1→R8 (her spec) first, then R9 (creative additions).**
Execution: Fable plans/reviews; Opus 4.8 agents implement phase by phase.

**IA: 5 tabs** — Home(Whispers) · Library · Tasks · Messages · You.
Series lives as a Library segment (Files | Series | Playlists). Commission
stays reachable from You.

### R1 — Home = Whispers feed (public front door)
- `/` becomes the whisper feed. Logged-out: whispers with audience `public`
  only + prominent "Connect with Patreon" CTA. Signed-in: feed for their level.
- Whisper `pinned` boolean — pinned posts stay on top (her toggle in Sanctum
  + inline on her own feed view).
- **Polls in whispers**: whisper kind `poll` linking the existing polls system;
  vote inline in the feed; respects audience levels.
- Old marketing landing content moves to `/about` (linked from feed header).

### R2 — Library v2 (public catalog + smart search)
- Catalog visible to everyone (logged-out included) — shibby/Calia funnel.
  Entitled files: normal card + Play. Locked files: dimmed/sealed variant with
  **Upgrade** (→ Patreon) instead of Play. Never hide titles.
- Filter bar: tag chips (by kind) + free-text smart search:
  title/description/tags via Postgres FTS + pg_trgm fuzzy ("similar words"),
  PLUS transcript full-text match (indicator only — never quote transcript
  text to subjects). Progressive fallback so results are never empty:
  exact → fuzzy → related tags → popular.
- Per-file actions: Play / File page / Add to queue / Add to playlist.
- **Subject playlists** (shibbydex parity): create/rename/delete, drag-drop
  reorder, play-all → feeds queue.
- Segments: Files | Series | Playlists.
- **Subject uploads**: private tracks (`ownerUserId`, visibility `private`) —
  upload → auto transcribe+analyze → prompted for author/title/description →
  appears ONLY in their library; their agent-tags land in Akasha's review
  queue for validation. Per-user quota setting; her kill-switch setting.

### R3 — File pages (subject-facing, shibby-style)
- `/library/track/[slug]`: artwork, description, [F4M]-style tag chips,
  **triggers mentioned** (names only), length, series/training membership,
  big Play (or Upgrade when locked). Approved data only; transcripts never.
- "After this" rail (same series / shared tags).

### R4 — Series as collections + Spotify queue
- Series get artwork + description + status (ongoing/weekly/ended — exists).
- Series page plays as a playlist; **player queue sheet** shows current +
  next tracks (Spotify pattern), drag-reorder, remove, jump-play; add-to-queue
  from anywhere. (Pulls forward the P1 queue + seek work: scrub bar, ±15s.)
- She reorders series items in Sanctum (drag).

### R5 — Tasks/Orders v2
- Orders: individual or collective (audience exists), **deadlines**,
  mark-done, **photo proof** — optional by default, her per-order toggle
  makes it required; proof review in Sanctum (approve → praise push).
- Tasks tab **flashes red** (badge + pulse) while anything is pending.

### R6 — You v2 (+ Ask + Secret mode)
- Stats: tasks completed, hours listened, current rank + progress, chain.
- Collar name, preferences, commission entry, settings.
- **Ask button** — "Petition her" form → wishes system; she answers from
  Sanctum; answer notifies the sub.
- **Secret mode (disguise)** — very visible toggle at top of You:
  1. ON → all push notifications are rewritten server-side to innocuous
     family-safe messages from a rotating pool ("Reminder: drink water",
     weather, generic news) with neutral icon; tapping still opens the app.
  2. Dynamic manifest: while ON, the PWA manifest serves a neutral name +
     icon ("Daily") so fresh installs look mundane; in-app hint that full
     disguise needs reinstall.
  3. The notification-permission step in The Gate offers the choice UP FRONT
     with a live example of both styles (normal vs disguised).
- In-app experience stays full — disguise affects only what the lock screen
  shows.

### R7 — Notifications everywhere
- Every sub-relevant event pushes (respecting quiet hours + disguise):
  order received / graded / deadline near, message received, rank up, new
  file at their level, series updated, commission stage change, ask answered,
  poll opened, whisper posted (exists), premiere unlock (R9).
- In-app "moments" queue: rank-ups and praise ALSO show as a ritual pop-up at
  next session start (deduped with push).

### R8 — Manual Patreon import, professional
- Patreon API cannot deliver post audio (verified 400 on attachments_media;
  known platform limitation). Import therefore pulls **all posts as shells**
  (title, description, date, patreonPostId; status `needs_audio`; hidden from
  subjects).
- **Bulk-attach screen**: drop N audio files → fuzzy filename↔title matching
  proposes pairs → she confirms/fixes via dropdown → attach streams file to
  shell → full pipeline runs. Per-shell single attach too.

### R9 — Creative additions (approved; build AFTER R1–R8)
1. "She sees you" — Sanctum live now-under view; one-tap line drops into the
   listener's session as an overlay.
2. Trigger Vault (sub-facing) — acquired triggers + locked mystery slots.
3. Rank ceremony — full-screen ritual pop-up on next session after rank-up.
4. Obedience percentile — anonymous "you obey more than N%".
5. The Oath — streak-gated collaring petition; inner whisper level + monthly
   gift file.
6. Premieres — scheduled unlock + countdown + push.
7. Surrender button — "she chooses" autoplay from recommendations.
8. Free-sample files — publicly playable picks for logged-out visitors.
9. Scheduled whispers + auto-welcome DM on first connect.

---

## Execution model ("think Fable, execute lower, heavy → Opus")

- This document is the thinking artifact. Each module above is a delegation
  unit: a sonnet-class agent implements from its spec in an isolated worktree;
  haiku-class agents do mechanical sweeps (fixtures, docs, emoji/color audits).
  The planner writes interface stubs first (queue API, store signatures,
  `track_analysis`/analyze schemas), reviews diffs, integrates, and runs the
  full gate (typecheck · lint · vitest · build) before every commit.
- **Two model axes, kept separate.** *Build-time* delegation = who writes the
  code (sonnet/haiku, under the planner). *Run-time* delegation = who does the
  heavy work in production: the **`analyze` job routes to Opus 4.8** for real
  dossier analysis (D3), with a haiku-class light model for short tracks and a
  local heuristic floor that always runs. The planner never hardcodes the
  provider — it's the `analysis_model` setting, and its name never reaches the
  UI (privacy).
- Order: **C1** (foundation: C1.1 → C1.2+C1.4 parallel → C1.3 → ship) →
  **D** (D1 store → D3 agent → D2 dossier → D4 subject page) →
  **I** (Patreon import; reuses C1.2 streaming + D3 rewrite) →
  **W** (reuses C1.2 uploads) → **P1 → P2 → P3**. Each phase ships alone.
  C1.5 (YouTube) only on Akasha's yes; D/I assume C1's durable queue exists.
