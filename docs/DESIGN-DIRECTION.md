# Design Direction — "Candlelit Atelier" (v2 visual system)

The authoritative art direction for the D1–D6 design elevation. Agents building
UI read this first, then `.claude/skills/frontend-design/SKILL.md`, then build.

## Thesis

A candlelit occult atelier. Near-black space layered like a dark room lit by a
single warm gold source. Image-led surfaces (bespoke art, never stock-looking).
The display serif used huge and confident. Motion slow and hypnotic — nothing
bouncy, nothing springy. **Signature element: the gold light itself breathes** —
a slow (6–8s) luminance pulse reserved for the few surfaces that matter most
(player artwork glow, collar card, premiere seals). Everything else stays still
and disciplined; the breath is noticeable precisely because it is rare.

Calibration warning (from the skill): near-black + single accent is an AI
default look. What must carry us past the default is (1) the bespoke art
library, (2) layered *warm* light with real depth rather than flat panels,
(3) the breathing-light signature, (4) editorial type scale. If a surface would
still read as "dark dashboard with gold buttons", it is not done.

## Palette & tokens

All colors already exist as tokens in `src/app/globals.css` (`--bg`, `--surface`,
`--gold`, `--line`, `--text`, `--text-dim`, …). **No raw hex in components.**
New tokens introduced by D2 (glows, elevation tiers, glass, breath animation)
are added to `globals.css` and demonstrated on `/styleguide` before use.

## D1 — Art library (`public/art/`)

Generated via Higgsfield (nano_banana_pro), one consistent style:
dark occult editorial still-life, near-black aubergine ground, single warm
candlelight, antique gold accents, faint smoke, film grain, generous negative
space, never any text inside the image.

Files (all committed, immutable paths):

| path | subject | used for |
| --- | --- | --- |
| `public/art/covers/default.jpg` | gold sigil of interlocked circles | fallback cover for any track |
| `public/art/covers/sleep.jpg` | gold crescent over black silk bedding | formats/purposes: sleep, nap, sleep aid |
| `public/art/covers/trance.jpg` | suspended gold pocket watch | hypnosis, induction, deepening, story / trance, binaural, subliminal |
| `public/art/covers/worship.jpg` | candlelit altar, kneeling shadow | worship, devotion, goddess worship |
| `public/art/covers/obedience.jpg` | gold chain arcing on velvet | obedience, submission, protocol, discipline, service, surrender |
| `public/art/covers/collar.jpg` | gold collar on velvet cushion | collar, ownership |
| `public/art/covers/blank.jpg` | porcelain mask in black fog | mindlessness, blank, drone, brainwashing, mind control |
| `public/art/covers/denial.jpg` | gold key + locked padlock on silk | chastity, denial, tease and denial, orgasm control, edging |
| `public/art/covers/addiction.jpg` | liquid gold dripping from a vial | obsession, addiction, conditioning, reinforcement, trigger install |
| `public/art/covers/transformation.jpg` | porcelain doll hand in silk ribbons | bimbofication, dollification, transformation, pet play, good boy, good girl |
| `public/art/covers/praise.jpg` | white feather in pool of gold light | praise, acceptance, confidence, self-love, relaxation, gentle |
| `public/art/covers/tribute.jpg` | gold coins and rings on black silk | findom, tribute |
| `public/art/covers/ritual.jpg` | candle circle around chalk sigil | ritual, daily task, mantra, affirmations, conditioning session, training session, check-in |
| `public/art/covers/collection.jpg` | velvet bound with gold cord + wax seal | default series/program/playlist cover |
| `public/art/hero.jpg` (21:9) | veiled feminine presence, face never visible | public home / landing hero |
| `public/art/gate.jpg` (16:9) | parted velvet curtains, gold light through gap | sign-in / Gate backdrop, empty-state hero moments |
| `public/art/empty.jpg` | one distant candle in vast darkness | empty states |

### Resolver contract — `src/lib/art/defaults.ts`

```ts
coverFamilyForTags(tags: string[]): CoverFamily   // pure, tested
defaultCoverFor(tags: string[]): string           // -> /art/covers/<family>.jpg
```

- Matching: theme tags outrank format/purpose tags; first family whose tag set
  intersects wins by a fixed priority order (collar > worship > obedience >
  blank > denial > addiction > transformation > tribute > praise > sleep >
  ritual > trance); unmatched → `default`.
- Display chain everywhere art shows: `tracks.artworkKey` (custom upload,
  signed URL) → `defaultCoverFor(tags)` → `/art/covers/default.jpg`.
  Series/programs/playlists: `artworkKey` → `/art/covers/collection.jpg`.
- Never render an empty art box; never expose raw storage URLs (existing rule).

## D2 — Light & depth

- Layered page background: base `--bg` + one large soft radial gold glow
  (top, ~5% alpha) + vignette toward edges. Implemented as body-level
  pseudo-elements / a `<PageGlow>` primitive — not per-page one-offs.
- Three elevation tiers as tokens: `--elev-1` (flat card), `--elev-2` (raised:
  subtle top edge-light + shadow), `--elev-3` (floating: player bar, sheets,
  modals — glass: translucent surface + `backdrop-blur`).
- `.breathes` utility: 6–8s ease-in-out glow pulse (box-shadow/opacity), used
  ONLY on player artwork, collar card, premiere seal. Disabled under
  `prefers-reduced-motion`.
- Cards that carry art get an art-derived aura: the cover image blurred+dimmed
  behind or a gold edge-light on hover; pick one treatment and use it everywhere.

## D3 — Typography

- Fluid display scale via `clamp()`: page openers ~`clamp(2.25rem, 6vw, 4rem)`,
  section heads one step down; body stays as is.
- Page openers get an eyebrow line (small caps, tracked, `--text-dim`) above the
  huge serif title — content-true labels, not decoration.
- Her "voice" lines (Whisper moments, quotes in feed) get an italic display
  treatment at larger size — the voice should *look* different from UI text.
- Numbers (streaks, ranks, durations) use lining tabular figures (`nums-lining`
  exists) at display sizes on You/rank surfaces.

## D4 — Motion

- Entrances: page content fades up 8–12px with 40–60ms stagger between cards,
  240–320ms, `--ease-out` (soft). One orchestrated entrance per page load — no
  scroll-triggered re-animation.
- Page transitions: View Transitions API cross-fade (progressive enhancement).
- Hovers: art scales 1.02 + aura brightens; buttons get a 150ms warm sheen.
  Focus-visible states styled to match (gold ring), never removed.
- All motion behind `prefers-reduced-motion` guard: reduced = instant states.
- Timing/easing live as tokens: `--dur-*`, `--ease-*` (extend existing set).

## D5 — Five signature surfaces (image-led rebuilds)

1. **Public home / whispers feed** — `hero.jpg` as a full-bleed cinematic
   opener (title over image, gold gradient scrim), pinned whisper as a large
   editorial card, feed cards with art thumbnails where a track/poll is
   attached. Signed-in home keeps the feed but opens with a slimmer hero band.
2. **Library** — cover-grid like a record shop: art-led cards (1:1 cover, title
   below, small meta), continue-listening shelf with larger art, locked items
   show the cover dimmed under a gold seal instead of a text-only "sealed" box.
3. **File page** — shibby-style hero: big cover art left (breathing glow when
   playing), title huge, description, tag chips, series strip, related tracks —
   art aura color behind the header area.
4. **Fullscreen player** — cover art center-stage with breathing aura, blurred
   cover as room light behind, controls floating on glass; spiral/grounding
   modes keep their current behavior.
5. **You page** — collar card becomes ceremonial (art backdrop, breathing gold
   when collared), rank/stat numbers at display scale, sections separated by
   light rather than boxes.

Sanctum: no rebuild — it inherits tokens, type scale, and motion automatically.

## D6 — Audit protocol

- Local rig: seeded Postgres + app on :3400 (scripts/qa-seed.ts, qa-cookie.ts),
  Playwright + bundled Chromium (`/opt/pw-browsers/chromium`).
- Screenshot every subject surface + the five signature surfaces, desktop
  (1440×900) and mobile (390×844), signed-out and signed-in personas.
- Critique each shot against this doc + the skill ("would this be mistaken for
  a template?"), fix, re-shoot. Ship only after: `pnpm typecheck && pnpm lint
  && pnpm test && pnpm build` all green and screenshots pass critique.

## Hard rules (unchanged)

Copy via `src/copy/copy.ts` only. Tokens only — no raw colors/fonts in
components. Every new primitive appears on `/styleguide`. No transcript
exposure, no other-subject exposure (D7), no raw storage URLs, no LLM provider
names. Deviations logged in `docs/DECISIONS.log.md`.
