/**
 * Hidden component catalog (PLAN §3/§4). Every primitive in every state, plus
 * the token palette, type, and icon set. The design system's reference page.
 */
import {
  Badge,
  Button,
  Card,
  Cover,
  Display,
  EmptyState,
  Eyebrow,
  Field,
  Input,
  Label,
  Ornament,
  PageHeading,
  Select,
  Voice,
  Whisper,
} from "@/components/ui";
import {
  COLLECTION_COVER,
  DEFAULT_COVER,
  EMPTY_IMAGE,
  defaultCoverFor,
} from "@/lib/art/defaults";
import { copy } from "@/copy/copy";
import {
  IconCheck,
  IconChevronDown,
  IconCollar,
  IconDescend,
  IconDrop,
  IconKeep,
  IconLibrary,
  IconLock,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconQueue,
  IconSeal,
  IconSkipBack15,
  IconSkipForward15,
  IconSpark,
  IconSpeak,
  IconTask,
  IconWarn,
} from "@/components/ui/icons";

const tokens = [
  "bg",
  "surface",
  "surface-raised",
  "line",
  "text",
  "text-dim",
  "accent",
  "accent-soft",
  "gold",
  "gold-deep",
  "danger",
];

const icons = [
  ["Play", IconPlay],
  ["Pause", IconPause],
  ["Prev", IconPrev],
  ["Next", IconNext],
  ["Back15", IconSkipBack15],
  ["Fwd15", IconSkipForward15],
  ["Queue", IconQueue],
  ["Lock", IconLock],
  ["Chevron", IconChevronDown],
  ["Spark", IconSpark],
  ["Keep", IconKeep],
  ["Check", IconCheck],
  ["Library", IconLibrary],
  ["Descend", IconDescend],
  ["Drop", IconDrop],
  ["Speak", IconSpeak],
  ["Collar", IconCollar],
  ["Seal", IconSeal],
  ["Task", IconTask],
  ["Warn", IconWarn],
] as const;

export default function StyleGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <PageHeading eyebrow="Design system">Styleguide</PageHeading>
      <Whisper className="mt-2">
        Editorial-occult: candlelit stone, engraved serif, antique gold,
        hairlines, grain, slow motion. Restyle the app from globals.css.
      </Whisper>
      <Ornament className="mt-6 w-full" />

      <section className="mt-10">
        <Label className="mb-3">Palette</Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {tokens.map((t) => (
            <div key={t} className="text-center">
              <div
                className="h-14 rounded-[var(--radius)] border border-line"
                style={{ background: `var(--color-${t})` }}
              />
              <span className="mt-1 block text-[0.625rem] tracking-wide text-text-dim">
                {t}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Type — fluid display scale</Label>
        <Eyebrow>The opener eyebrow</Eyebrow>
        <Display size="opener" className="mt-2">
          Deeper than you meant to.
        </Display>
        <Display size="section" as="h2" className="mt-5 text-text-dim">
          Section head — one step down.
        </Display>
        <Voice className="mt-5 max-w-md">{copy.brand.tagline}</Voice>
        <p className="mt-5 text-text">
          Body text — the quiet system face, for everything functional.
        </p>
        <Whisper className="mt-2">Whisper — dim secondary microcopy.</Whisper>
        <Label className="mt-3">Letterspaced label</Label>
        <p className="nums-lining mt-5 font-[family-name:var(--font-display)] text-[length:var(--display-2)] leading-none text-gold">
          888
          <span className="ml-3 align-middle font-[family-name:var(--font-body)] text-xs tracking-[0.14em] uppercase text-text-dim">
            lining tabular figures, at display scale
          </span>
        </p>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Icons</Label>
        <div className="flex flex-wrap gap-4">
          {icons.map(([name, I]) => (
            <div
              key={name}
              className="flex w-16 flex-col items-center gap-1.5 text-text-dim"
            >
              <I size={22} />
              <span className="text-[0.5625rem] tracking-wide">{name}</span>
            </div>
          ))}
        </div>

        {/* F3 · the love mark — hollow (untaken), filled gold (surrendered), and
            the one-shot gold bloom on tap (steady under reduced-motion). */}
        <Label className="mt-6 mb-3">The love mark (F3)</Label>
        <div className="flex flex-wrap items-center gap-6">
          <span className="inline-flex items-center gap-2 text-text-dim/70">
            <IconDrop size={18} />
            <span className="nums-lining text-xs">Be the first.</span>
          </span>
          <span className="inline-flex items-center gap-2 text-gold">
            <IconDrop size={18} filled />
            <span className="nums-lining text-xs">23 surrendered</span>
          </span>
          <span className="love-pulse inline-flex text-gold">
            <IconDrop size={18} filled />
          </span>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Buttons</Label>
        <div className="flex flex-wrap gap-3">
          <Button variant="gold">Enter</Button>
          <Button variant="primary">Claim</Button>
          <Button variant="ghost">Later</Button>
          <Button variant="danger">Bring me back</Button>
          <Button variant="gold" disabled>
            Sealed
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Badges</Label>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">draft</Badge>
          <Badge tone="gold">888 · Devoted</Badge>
          <Badge tone="danger">frozen</Badge>
          <Badge tone="sealed">sealed</Badge>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Inputs</Label>
        <div className="flex max-w-sm flex-col gap-4">
          <Field label="What do I call you?" hint="This becomes your name.">
            <Input placeholder="my subject" />
          </Field>
          <Field label="How you address me">
            <Select>
              <option>Goddess</option>
              <option>Mistress</option>
              <option>Akasha</option>
            </Select>
          </Field>
          <div>
            <Label className="mb-2">Range — the pull sliders</Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              defaultValue={0.4}
              className="range-gold w-full"
              aria-label="A gold hairline with a glowing ember thumb"
            />
            <Whisper className="mt-1">
              A gold hairline with a warm, glowing ember for a thumb — the
              fullscreen player&rsquo;s pace and volume (.range-gold).
            </Whisper>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Cards</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <Display as="h3" className="text-xl">
              Surface
            </Display>
            <Whisper className="mt-1">A resting card.</Whisper>
          </Card>
          <Card raised>
            <Display as="h3" className="text-xl">
              Raised
            </Display>
            <Whisper className="mt-1">Lifted, for focus.</Whisper>
          </Card>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Light &amp; depth</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="elev-1 rounded-[var(--radius-lg)] border border-line/80 bg-surface p-5">
            <Eyebrow>elev-1</Eyebrow>
            <Whisper className="mt-1">Flat. A resting surface.</Whisper>
          </div>
          <div className="elev-2 rounded-[var(--radius-lg)] border border-line/80 bg-surface-raised p-5">
            <Eyebrow>elev-2</Eyebrow>
            <Whisper className="mt-1">Raised — top edge-light, soft cast.</Whisper>
          </div>
          <div className="glass elev-3 rounded-[var(--radius-lg)] border border-line/70 p-5">
            <Eyebrow>elev-3 · glass</Eyebrow>
            <Whisper className="mt-1">Floating — translucent, blurred.</Whisper>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-5">
          <span
            aria-hidden
            className="breathes flex h-16 w-16 items-center justify-center rounded-full border border-gold/40 text-gold"
          >
            <IconSeal size={28} />
          </span>
          <div>
            <Eyebrow>.breathes</Eyebrow>
            <Whisper className="mt-1 max-w-xs">
              The gold breath — a slow luminance pulse for the few signature
              surfaces (collar, player artwork, premiere seal). Still under
              reduced-motion.
            </Whisper>
          </div>
        </div>

        <div className="mt-6">
          <Eyebrow>Page glow</Eyebrow>
          <div
            aria-hidden
            className="mt-2 h-28 rounded-[var(--radius-lg)] border border-line/60"
            style={{
              background:
                "var(--page-glow-top), var(--page-vignette), var(--color-bg)",
            }}
          />
          <Whisper className="mt-1">
            Ambient candlelight — one warm source from the top and an edge
            vignette, painted once behind the whole app by &lt;PageGlow/&gt;.
          </Whisper>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Cover art — the resolver (D1) + frame (D5)</Label>
        <Whisper className="mb-4 max-w-lg">
          Every track shows real art: a custom upload (signed) or the bespoke
          default for its tags. The frame lifts + its aura brightens on hover;
          `breathing` lights the gold breath; `dimmed` veils a sealed track.
        </Whisper>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="group">
            <Cover src={defaultCoverFor(["chastity"])} className="aspect-square" />
            <span className="mt-1.5 block text-[0.625rem] tracking-wide text-text-dim">
              denial (theme)
            </span>
          </div>
          <div className="group">
            <Cover src={defaultCoverFor(["collar"])} className="aspect-square" />
            <span className="mt-1.5 block text-[0.625rem] tracking-wide text-text-dim">
              collar
            </span>
          </div>
          <div className="group">
            <Cover src={COLLECTION_COVER} className="aspect-square" />
            <span className="mt-1.5 block text-[0.625rem] tracking-wide text-text-dim">
              collection
            </span>
          </div>
          <div className="group">
            <Cover
              src={DEFAULT_COVER}
              dimmed
              className="aspect-square"
              overlay={
                <span
                  aria-hidden
                  className="glow-gold absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-bg/60 text-gold/90 backdrop-blur-sm"
                >
                  <IconLock size={18} />
                </span>
              }
            />
            <span className="mt-1.5 block text-[0.625rem] tracking-wide text-text-dim">
              sealed
            </span>
          </div>
        </div>
        <div className="mt-5 max-w-[8rem]">
          <Cover
            src={defaultCoverFor(["worship"])}
            breathing
            className="aspect-square"
          />
          <span className="mt-1.5 block text-[0.625rem] tracking-wide text-text-dim">
            breathing (player)
          </span>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Motion (D4)</Label>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Eyebrow>.enter-stagger</Eyebrow>
            <Whisper className="mt-1 mb-3 max-w-xs">
              One orchestrated page-load entrance — children fade up 10px, 50ms
              apart. CSS-only, fires once, stilled under reduced-motion.
            </Whisper>
            <div className="enter-stagger flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="h-10 w-10 rounded-[var(--radius)] border border-line bg-surface-raised"
                />
              ))}
            </div>
          </div>
          <div>
            <Eyebrow>.glow-gold · button sheen</Eyebrow>
            <Whisper className="mt-1 mb-3 max-w-xs">
              A static warm halo for gold controls + art; a quick warm sheen
              rises on any button hover (150ms).
            </Whisper>
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="glow-gold flex h-10 w-10 items-center justify-center rounded-full bg-gold text-bg"
              >
                <IconSeal size={18} />
              </span>
              <Button variant="gold">Hover me</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Empty state (D5)</Label>
        <EmptyState image={EMPTY_IMAGE}>{copy.library.empty}</EmptyState>
      </section>

      <section className="mt-10">
        <Label className="mb-3">Ornament</Label>
        <Ornament className="w-64" />
      </section>
    </main>
  );
}
