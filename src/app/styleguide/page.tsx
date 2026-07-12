/**
 * Hidden component catalog (PLAN §3/§4). Every primitive in every state, plus
 * the token palette, type, and icon set. The design system's reference page.
 */
import {
  Badge,
  Button,
  Card,
  Display,
  Field,
  Input,
  Label,
  Ornament,
  Select,
  Whisper,
} from "@/components/ui";
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
  IconSeal,
  IconSpark,
  IconSpeak,
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
  ["Warn", IconWarn],
] as const;

export default function StyleGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Label>Design system</Label>
      <Display className="mt-2 text-4xl">Styleguide</Display>
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
        <Label className="mb-3">Type</Label>
        <Display className="text-5xl">Deeper than you meant to.</Display>
        <p className="mt-2 font-[family-name:var(--font-display)] text-xl italic text-text-dim">
          The whisper — display italic, for her voice.
        </p>
        <p className="mt-3 text-text">
          Body text — the quiet system face, for everything functional.
        </p>
        <Whisper className="mt-2">Whisper — dim secondary microcopy.</Whisper>
        <Label className="mt-3">Letterspaced label</Label>
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
        <Label className="mb-3">Ornament</Label>
        <Ornament className="w-64" />
      </section>
    </main>
  );
}
