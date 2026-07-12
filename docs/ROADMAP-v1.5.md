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

Priority: content first (C1), then player (P1→P3).

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

## Execution model ("think Fable, execute lower")

- This document is the thinking artifact. Each C1/P module above is a
  delegation unit: a sonnet-class agent implements from its spec in an
  isolated worktree; haiku-class agents do mechanical sweeps (fixtures, docs,
  emoji/color audits). The planner writes interface stubs first (queue API,
  store signatures), reviews diffs, integrates, and runs the full gate
  (typecheck · lint · vitest · build) before every commit.
- Order: C1.1 → C1.2+C1.4 (parallel) → C1.3 → ship. Then **W** (reuses C1.2
  uploads), then P1 → P2 → P3 — each phase shippable alone. C1.5 only on
  Akasha's yes.
