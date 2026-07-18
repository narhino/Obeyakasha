/**
 * Hidden component catalog (PLAN §3/§4). Every primitive in every state, plus
 * the token palette, type, and icon set. The design system's reference page.
 */
import {
  Badge,
  Button,
  Card,
  Display,
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
import { copy } from "@/copy/copy";
import {
  IconCheck,
  IconChevronDown,
  IconCollar,
  IconDescend,
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
        <Label className="mb-3">Ornament</Label>
        <Ornament className="w-64" />
      </section>
    </main>
  );
}
