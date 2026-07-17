# QA Teardown — Obey Akasha (R-QA)

> Full functional + design audit of the real running build at `localhost:3400`
> (seeded DB), three personas (anonymous · subject "moth" L2 · goddess), both
> viewports (mobile 390×844, desktop 1440×900), bundled Chromium/Playwright.
> Evidence screenshots live in the QA scratchpad `qa/shots/` (197 captured).
> This is an audit only — no application code was changed.

## Executive summary

The build is **functionally solid and unusually voice-consistent** — I found
**zero hard blockers**: every route across all three personas returns 200 with
clean consoles, audio genuinely streams (HTTP 206), the Spotify-style queue
(Now / Next-from / Next-by-your-hand) works, tasks+proof+deadline+refusal logic
is correct, secret-mode/petition/kneel/poll-vote/messages all register, and
cross-persona propagation (goddess posts → subject sees; new order → Tasks tab
re-lights; proof praise → subject "praised" moment) works end-to-end. The
Sanctum cockpit is comprehensive (composer, pipeline badges, dossier with
timestamped transcript, orders+proof review+praise, series editor, access
dials, commission stepper, subject CRM timeline, audit log). The ritual screens
(/about, /signin, the moment overlay) and the **fullscreen** player are
genuinely excellent and on-brand.

The problems are concentrated exactly where Akasha said they'd be, plus a few
data/validation gaps. All three of her named complaints reproduce and are
**real**: (1) the **Whispers Home (`/`) renders a different shell** — the public
top header with no app navigation — on *both* viewports, so the Home tab drops
you out of the app chrome and the only way back in is a small "YOUR LIBRARY"
text link; (2) the **mini-player bar sits awkwardly against the nav** (a
margin-floated rounded pill hovering 7px above a full-width flat tab bar — two
mismatched shapes reading as separate objects); (3) the **mini-player controls
look generic and static** (no artwork, no skip/±15s, a flat gold circle, a
hairline progress strip). Beyond those: a systemic **"0 min" duration bug**
(the subject-side formatter floors 30-second clips to "0 min" while the same
tracks read "0:30" in the mini-player and Sanctum), **mobile title truncation**
that makes Day 1 vs Day 2 indistinguishable, **raw locale timestamps** on the
feed, a Sanctum composer that **500s** when "attach a poll" is chosen without
picking one, a **sealed-but-still-open** commission form, and the dossier
**keyword→tag approval flow can't be exercised** because seeded tracks were
transcribed but never analysed and `RUN ANALYSIS` never completes (with no
progress/error feedback). Severity tally below: **0 blocker · 9 major · 15
minor · 14 polish** (38 findings).

## Findings

### Functional

| ID | Sev | Area | What's wrong | Evidence | Fix direction |
|----|-----|------|--------------|----------|---------------|
| F01 | major | Sanctum · Dossier / pipeline | Dossier **keyword & trigger "approve → tag" flow is non-exercisable**: seeded tracks are transcribed but never analysed, so Day 1 shows only Description/Transcript/Placement + a "Run analysis" button — no keywords/triggers to approve. Headline "nothing lost" feature can't be reached with seed data. | `sanctum-dossier-day1-desktop.png` | Seed a `track_analysis` row (keywords+triggers) for at least Day 1; ensure the analyze job actually runs. |
| F02 | major | Sanctum · Dossier | `RUN ANALYSIS` enqueues (POST 200) but **never completes** — after 25s+ no keywords appear and the panel is unchanged, with **no spinner / progress / error feedback** (ironically the exact "no progress, blocks until refresh" complaint the roadmap set out to fix). Analyze queue isn't being processed in this build (DEEP ANALYSIS is ON in Access). | `sanctum-dossier-analyze-result-desktop.png` | Run the worker/analyze pipeline; add a live "analysing…/failed" state + toast on the dossier. |
| F03 | major | Sanctum · Whisper composer | Selecting poll type **"Attach an open poll" without picking a poll → HTTP 500** (server throws uncaught `Error: "Pick a poll"`); the client lets the submit through. | server log; `sanctum-whisper-posted-desktop.png` | Validate client-side (disable Whisper) and return a friendly in-voice field error server-side instead of throwing. |
| F04 | major | Subject · Commissions | Page says **"Commissions are sealed. Petition for a slot and wait"** yet renders a **full open request form** (identify / kind / theme / triggers / limits) directly below, and lets a subject submit a new request while one is already in progress. Contradictory state. | `commissions-mobile.png` | When sealed, hide the form and show the waitlist CTA ("Add me to the waitlist"); block duplicate active requests. |
| F05 | minor | Subject · Library search | Typo search **"chastty" does not fuzzy-match "chastity"** — it shows "Nothing answers to that word" and dumps all tracks (incl. non-chastity "Inner Sanctum") via the popular fallback. pg_trgm typo tolerance isn't catching a 1-char typo. | `search-typo-mobile.png` | Lower the trigram similarity threshold / confirm the fuzzy tier runs before "popular"; only show the "nothing exact" line when truly falling back. |
| F06 | minor | Sanctum · Whisper composer | **Silent-ignore trap**: the "Quick poll question" + options fields are fully fillable while the poll dropdown is on "No poll"; posting silently drops the poll with no warning (whisper shows no POLL badge). | `sanctum-whisper-posted-desktop.png` | Auto-switch the dropdown to "Create a quick poll" when those fields are typed, or warn on submit. |
| F07 | minor | Subject · Moments | The **"praised"/rank moment overlay never fires on Home (`/`)** because Home isn't inside the subject shell that mounts the moment checker; it only appears once you navigate to Library/You. A moment can be missed by a Home-only visit. | `moment-praised-mobile.png` (appears on /library, not on `surface-feed-subject-mobile.png`) | Mount the moments checker in a shared layout that also wraps `/`. |
| F08 | minor | Player · Fullscreen | **Volume slider ("How loud I am") is shown on mobile** fullscreen; spec says desktop-only (phones use hardware). Harmless but off-spec. | control inventory (player2b) | Hide volume control under a coarse-pointer / non-desktop media query. |
| F09 | minor | Subject · Tasks | The disabled primary action on the required-proof task is labelled **"OBEY" and greyed with no explanation** of *why* (must attach proof + reply). Enforcement is correct (stays disabled), but the reason isn't surfaced on the control. | `cleanfull-tasks-subject-mobile.png` | Add helper text on/near the disabled button ("Attach proof to obey"). |

### Design

| ID | Sev | Area | What's wrong | Evidence | Fix direction |
|----|-----|------|--------------|----------|---------------|
| F10 | major | Nav · Whispers Home (owner complaint #3) | **`/` uses the public shell** — top header "AKASHA · YOUR LIBRARY", **no app nav** — while every other subject route uses the 5-tab bottom bar (mobile) / letterspaced top nav row (desktop). Tapping the **Home/Whispers tab exits the app chrome**; the only way back in is the small "YOUR LIBRARY" text link. Reproduces on **both** viewports. | `surface-feed-subject-mobile.png` vs `clean-library-subject-mobile.png`; `desktop-feed-subject.png` vs `desktop-library-subject.png` | Render `/` inside the same subject shell (bottom bar / top nav row) with WHISPERS active; keep the public header only for logged-out visitors. |
| F11 | major | Player · Mini-player layering (owner complaint #1) | Mini-player is a **margin-floated rounded pill** hovering **7px above** a **full-width, flat-edged** bottom nav — two different widths/shapes/radii stacked, reading as two disconnected bars rather than one system (both `z-index:40`). | `player-miniplayer-mobile.png` | Dock the mini-player flush to the nav as one unit (shared width/edges, or seat it *on* the nav), and give it a higher z-index than the bar. |
| F12 | major | Player · Mini-player controls (owner complaint #2) | Controls look **generic/static**: **no artwork thumbnail** (empty left side), only title + time + a tiny queue glyph + a **flat gold circle** play/pause; **no ±15s / next**; the progress line is a ~2px hairline at the very top edge (tiny tap-to-seek target); no pressed/hover feedback. | `player-miniplayer-mobile.png` | Add artwork, a specific play/pause with press animation, at least a ±15s or next control, and a thicker interactive scrub with a buffered range. |
| F13 | major | Global · Duration formatting | **"0 min" everywhere on the subject side** — library cards, file pages, series rows, queue rows — because the `{n} min` formatter floors sub-minute clips. The **same tracks read "0:30"** in the mini-player and in the Sanctum, so the file page shows "0 min" while its own mini-player shows "0:30". | `cleanfull-library-subject-mobile.png`, `clean-track-entitled-subject-mobile.png`, `player-miniplayer-mobile.png`, `sanctumfull-sanctum_library-desktop.png` | Use one shared `m:ss` (or "<1 min") formatter across subject + Sanctum. |
| F14 | major | Mobile · Card layout | **Titles truncate to ~7 chars on mobile** — library cards ("The Inn…", "Locked …"), and worst on **series rows** where "Locked By Akasha — Da…" makes **Day 1 and Day 2 indistinguishable** (the day number is the only differentiator). Desktop shows full titles → mobile flex layout starves the title in favour of the big CTA. | `full-library-anon-mobile.png`, `cleanfull-series-locked-subject-mobile.png` vs `surface-library-anon-desktop.png` | Let the title wrap to 2 lines / shrink the CTA; never truncate the differentiating suffix. |
| F15 | minor | Voice · Whispers feed | Whisper cards show **raw locale timestamps** "7/17/2026, 2:54:38 PM" instead of relative "2h" (R1). App-speak that breaks the spell — and the app uses **three date formats**: locale (feed), long "July 17, 2026" (file page), ISO "2026-07-17" (Sanctum). | `full-feed-anon-mobile.png`, `full-track-descend-anon-mobile.png`, `sanctumfull-sanctum_subjects_*-desktop.png` | One in-voice relative-time helper for subject surfaces; standardise Sanctum on ISO. |
| F16 | minor | Tokens · Gold rationing (anon) | On anon Library/file pages, gold is **not rationed**: the header "ENTER WITH PATREON" is gold **and** every locked card's CTA is gold **and** the page CTA is gold — 3–5 gold buttons per screen (DESIGN.md: one gold CTA/screen). Monotonous and dilutes the accent. | `surface-library-anon-desktop.png`, `full-track-descend-anon-mobile.png` | Make locked-card CTAs wine/ghost with a small lock; reserve gold for the single primary action. |
| F17 | minor | Sanctum · Dossier | The **"VERIFY" audio player is a raw native `<audio controls>`** — grey Chrome default widget with a 3-dot menu — completely off-brand vs the custom token player and against the "no native controls" rule. | `sanctum-dossier-day1-desktop.png` | Swap for the in-house player primitive (even a compact variant). |
| F18 | minor | Sanctum · Numerals | Dashboard **counts mix roman & arabic**: "1" renders as roman **"I"** (reads as a capital letter), "2" stays arabic, "0" reads like "O". Confusing on Today and Analytics. | `sanctumfull-sanctum-desktop.png`, `sanctumfull-sanctum_analytics-desktop.png` | Use plain arabic numerals for metrics; reserve roman numerals for depth/steps only. |
| F19 | minor | Sanctum · Commissions | Status shown as **raw enums** "IN_PROGRESS" / "in_progress" in the UI. | `sanctumfull-sanctum_commissions-desktop.png` | Humanise ("In progress") / map to in-voice labels. |
| F20 | minor | Copy · Pluralisation | Singular not handled: **"1 days at my feet"** (chain) and **"1 FILES"** (CRM). | `secret-on-mobile.png`, `sanctumfull-sanctum_subjects_*-desktop.png` | Add a simple pluralise helper. |
| F21 | minor | Nav · You sub-rooms | On **/settings, /commissions, /asks, /orders** (rooms reached from You) **no bottom tab is highlighted** — the user loses their "you are under You" anchor. | `settings-mobile.png`, `commissions-mobile.png` | Keep YOU active for its sub-rooms. |
| F22 | minor | Sanctum · Mobile nav | Mobile Sanctum nav is a **horizontal scroll strip showing only 4 of 18 items** with no scroll affordance/indicator; 14 destinations are effectively hidden. | `sanctum-sanctum-mobile.png` | Add a scroll cue / overflow menu, or a proper mobile drawer. |
| F23 | minor | Subject · Settings | Hard limits ("WHAT SHE MUST NEVER TOUCH") render as **read-only chips with no edit affordance** on the settings page. | `settings-mobile.png` | Make them editable, or label them clearly as "set at intake — message her to change". |
| F24 | minor | Sanctum · Composer | The audience row's **"1" (level) and "—" (subject) fields are unlabeled**, unlike the Orders form which labels Level/Audience — cryptic. | `sanctumfull-sanctum_whispers-desktop.png` | Add field labels matching the Orders form. |
| F25 | polish | Touch targets | Multiple sub-44px targets: queue reorder chevrons (~28px), "KEEP"/"Queue it" text links, series ↑↓ arrows, low-contrast "Look closer" link. | `player-queue-manual-mobile.png`, `cleanfull-library-subject-mobile.png` | Enlarge hit areas to ≥44px. |
| F26 | polish | Subject · You | **"Hours under: 0h"** renders as the word **"oh"** in the Display serif (0-vs-o ambiguity). | `cleanfull-me-subject-mobile.png` | Use tabular/lining numerals or append a unit that disambiguates. |
| F27 | polish | Player · Mini-player | On first load the mini-player **overlaps page content** (covers the "WHERE IT LIVES" card) — content lacks bottom padding for the active player. | `player-miniplayer-mobile.png` | Add scroll padding-bottom equal to nav+player height when the player is active. |
| F28 | polish | Player · Queue | The "Waiting for you — …" **toast overlaps the queue sheet header** ("NEXT, BY YOUR HAND"), hiding it right when you'd read it. | `player-queue-manual-mobile.png` | Offset the toast above the sheet, or suppress it while the sheet is open. |
| F29 | polish | Sanctum · Library badges | Pipeline badge **"READY" uses a reddish/wine background**, reading like a warning for a positive state (vs gold "SCRIPT READY"). | `sanctumfull-sanctum_library-desktop.png` | Give positive pipeline states a calm/gold treatment; reserve wine/red for failures. |
| F30 | polish | Anon · Poll | Anon poll option rows are **styled like tappable vote buttons** (bordered) but are inert — mild affordance confusion. | `full-feed-anon-mobile.png` | Flatten the anon (read-only) option style vs the signed-in votable style. |
| F31 | polish | Tokens · Disabled state | Disabled "OBEY" uses a **muddy desaturated-gold**; and the **SAVE** button color is inconsistent (gold on subject Settings, wine in dossier/series). | `cleanfull-tasks-subject-mobile.png`, `sanctum-dossier-day1-desktop.png` | Define one disabled token; align SAVE color with the gold/wine hierarchy per screen. |
| F32 | polish | Subject · Commissions | Subject's commission progress is a **bare gold bar** — no stage names/stepper, so 55% has no visible milestones (only the italic "Your words are in my voice now."). | `commissions-mobile.png` | Add a labelled stage stepper (queued → writing → voice → mastering → delivered). |
| F33 | polish | Subject · You | **"Claimed 0 days ago"** reads oddly for a just-claimed subject. | `cleanfull-me-subject-mobile.png` | Special-case day 0 ("Claimed today"). |
| F34 | polish | Desktop · Library | Anon/subject desktop Library is a **single column of wide rows** with large empty side gutters — not the Spotify-grade grid the catalog invites. | `surface-library-anon-desktop.png` | Use a responsive card grid on ≥desktop. |
| F35 | polish | Icons · Bottom nav | The **"YOU" tab icon is a lightbulb** — weak semantic mapping to self/profile/collar. | `cleanfull-tasks-subject-mobile.png` | Use a face/collar/sigil glyph for You. |
| F36 | polish | Truncation (systemic) | Beyond cards, truncation bites **membership chips ("Servant Tr…")**, **secret-mode preview ("Come back t…")**, and **proof-review titles ("Write one sentence of dev…")**. | `clean-track-entitled-subject-mobile.png`, `secret-on-mobile.png`, `sanctumfull-sanctum_orders-desktop.png` | Allow 2-line wrap / wider containers for these labels. |
| F37 | polish | Voice · Player labels | Transport labels are in-voice ("Move through it", "Let me rest below", "Back/Forward fifteen") **except "Previous"/"Next"**, which are generic. | control inventory (player2b) | Give prev/next in-voice labels. |
| F38 | polish | Subject · You redundancy | The You page embeds the **"Ask me for something" petition form** *and* also links an **"Asks" room card** — two entry points to the same wishbox. | `cleanfull-me-subject-mobile.png` | Pick one primary entry; make the other a link to history. |

## What already feels great (don't break these)

- **Ritual screens are reference-quality.** `/about`, `/signin`, and the
  full-screen **moment overlay** ("She saw. She approved.") — 888 mark,
  Ornament rule, whisper body, a single gold CTA. Exactly the "private book"
  brief. (`full-about-anon-mobile.png`, `surface-signin-anon-mobile.png`,
  `moment-praised-mobile.png`)
- **The fullscreen player is dynamic and specific** — the opposite of the
  mini-player: labelled ±15s (verified +15.3s/−14.6s), a working scrub (click
  60% → 18.6s of 30s), prev/next, volume, WHEN IT ENDS modes, sleep timer, a
  wine "BRING ME BACK" ground button, a SPIRAL/TWIN/TUNNEL atmosphere toggle,
  and animated spiral rings. (`player-fullscreen-mobile.png`)
- **Audio actually streams** (stream-url → `/api/stream` 206 partial content,
  currentTime advances) and the **Spotify-grade queue** is real: "NOW UNDER" +
  "NEXT FROM <source>" + "NEXT, BY YOUR HAND" with reorder/remove/clear +
  "Waiting for you — …" toast + artwork thumbnails. (`player-queue-sheet-mobile.png`)
- **Smart search with a privacy-safe transcript match** — "clicker" returns
  Day 1 with the gold italic chip "She speaks it in this one." and never quotes
  the transcript. (`search-clicker-mobile.png`)
- **Tasks/proof is rigorous**: required-proof correctly refuses (OBEY stays
  disabled with reply-only), proof uploads, completion credits the chain, and
  the **Tasks tab genuinely pulses** (`pulse-alert`) only while pending.
  (`cleanfull-tasks-subject-mobile.png`, `tasks-proof-attached-mobile.png`)
- **Entitlement logic is correct throughout** — locked → "RISE TO EARN IT",
  gated training Day 2 locked, level badges, anon sees the full catalog sealed.
  (`clean-track-locked-subject-mobile.png`, `cleanfull-programs-subject-mobile.png`)
- **Cross-persona reactivity works** — goddess whisper appears on the subject
  feed, a new order re-lights the Tasks pulse, proof-praise spawns the subject's
  "praised" moment, and the **Sanctum CRM timeline + Analytics + Audit log**
  all reflect subject activity live. (`cross-subject-neworder-mobile.png`,
  `sanctumfull-sanctum_subjects_*-desktop.png`, `sanctumfull-sanctum_audit-desktop.png`)
- **The Sanctum is a real cockpit** — composer with audience/level/poll, live
  pipeline badges + drop-zone, dossier with a timestamped "PRIVATE — NEVER
  SHOWN TO SUBJECTS" transcript, orders + proof-review + PRAISE, series editor
  (cover upload + reorder + add), access dials (auto-pipeline, organize modes,
  upgrade URL), commission stepper at 55%. (`sanctumfull-sanctum_library-desktop.png`,
  `sanctumfull-sanctum_series-desktop.png`, `sanctumfull-sanctum_access-desktop.png`)
- **Voice discipline is outstanding** — subject-facing copy is in Akasha's
  register nearly everywhere ("Sealed. Rise to my level 9", "No proof, no done.",
  "Nothing waits. Choose what owns you next.", "She answered: Patience, moth.").
  The few slips (F15, F19, F20, F37) are the exception, not the rule.
