# Design system — "editorial-occult"

The visual identity of OBEY AKASHA. One paragraph brief, then the rules.
Everything routes through `src/app/globals.css` (tokens) and
`src/components/ui/` (primitives + icons); `/styleguide` renders it all.

**Brief.** Candlelit stone, not neon dungeon. Engraved serif authority,
antique gold on violet-black, hairline rules, film grain, slow deliberate
motion. It should feel like a private book you were handed, not an app —
and absolutely not like an AI-generated site (no Inter, no purple-blue
gradients, no glass cards, no emoji controls).

## Type

- **Display:** Cormorant Garamond (400/500/600 + italics), self-hosted at
  build via `next/font` — CSP-safe, no runtime requests. Used for titles,
  the 888 mark, numerals (roman numerals for depth), and *her voice in
  italic*.
- **Body:** the system humanist stack, deliberately not a webfont. Quiet,
  native, fast.
- **Labels:** letterspaced uppercase micro-labels (`.label-caps`, `<Label>`),
  0.22em tracking — the engraved-plate signature of the system.

## Palette (tokens in globals.css)

| Token | Value | Role |
|---|---|---|
| bg | `#0b0812` | violet-black room |
| surface / surface-raised | `#140f1d` / `#1c1527` | cards |
| line | `#2c2338` | hairlines everywhere |
| text / text-dim | `#eae3d6` / `#9a8fa6` | bone / ash |
| accent / accent-soft | `#8a2e4f` / `#2b1020` | oxblood wine |
| gold / gold-deep | `#d4af6a` / `#a9853f` | antique gold (CTAs, active) |
| danger | `#b3402f` | grounding, frozen |

Gold is rationed: one gold CTA per screen, gold for active/held states.
Wine is the secondary action. Everything else is bone on black.

## Signature moves

- **Ornament rule** `── ✦ ──` (`<Ornament>`) between title and body on
  ritual screens (landing, gate, intake, drop report).
- **Film grain** — fixed 5% SVG-noise overlay (`.grain`, mounted once in the
  root layout). Kills flat digital fill. (Note: full-page screenshot tools
  stitch it oddly; live rendering is uniform.)
- **The slow wheel** — landing's spoked disc, one turn per 4 minutes
  (`.turn-slow`), masked to a ring. Reduced-motion turns it off.
- **Breathing vignettes** — `radial-gradient(... var(--color-accent-soft))`
  + `.breathe` (9s) behind hero content.
- **Roman numerals** for depth ratings and intake steps.
- **Icons** — hand-drawn 1.5-stroke set in `src/components/ui/icons.tsx`
  (play/pause/skips, lock, spark ✦, keep, collar, descend-steps…). Never
  emoji in UI controls.
- **Motion** — 400/700ms, `--ease-trance`, opacity/color only. Nothing
  bounces. `prefers-reduced-motion` respected globally.

## Navigation

- **Mobile (subject):** fixed bottom tab bar, 5 rooms — Library, Trainings,
  Whispers, Speak, You — safe-area padded; secondary rooms (Asks, Orders,
  Commission, Settings) are cards on the You page. Mini-player floats above
  the bar.
- **Desktop (subject):** letterspaced uppercase header row, gold active
  state.
- **Sanctum:** dense sidebar (scrollable rail on mobile), same tokens,
  less theater — it's her cockpit.

## Rules for future edits

1. Never introduce a raw hex/color class in a component — extend the tokens.
2. Never use an emoji as a control — extend `icons.tsx`.
3. One gold CTA per screen; wine for the second action; ghost for the rest.
4. New ritual screens get: Display title → Ornament → Whisper body → CTA.
5. Check every new primitive/state into `/styleguide`.
