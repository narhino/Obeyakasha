/**
 * Hidden component catalog (PLAN §3/§4). The design pass works from this
 * page — every primitive in every state, all tokens visible. Not linked
 * from anywhere; noindex via root metadata.
 */
import {
  Badge,
  Button,
  Card,
  Display,
  Field,
  Input,
  Select,
  Whisper,
} from "@/components/ui";

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
  "danger",
];

export default function StyleGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Display className="text-3xl">Styleguide</Display>
      <Whisper className="mt-1">
        Token contract + primitives. Restyle the platform here.
      </Whisper>

      <section className="mt-10">
        <Display as="h2" className="mb-3 text-xl">
          Tokens
        </Display>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {tokens.map((t) => (
            <div key={t} className="text-center">
              <div
                className="h-14 rounded-[var(--radius)] border border-line"
                style={{ background: `var(--color-${t})` }}
              />
              <span className="mt-1 block text-xs text-text-dim">{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <Display as="h2" className="mb-3 text-xl">
          Type
        </Display>
        <Display className="text-4xl">Display / Cormorant</Display>
        <p className="mt-2 text-text">Body text — the voice at rest.</p>
        <Whisper className="mt-2">
          Whisper — dim, quiet, secondary microcopy.
        </Whisper>
      </section>

      <section className="mt-10">
        <Display as="h2" className="mb-3 text-xl">
          Buttons
        </Display>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="gold">Gold</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section className="mt-10">
        <Display as="h2" className="mb-3 text-xl">
          Badges
        </Display>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">neutral</Badge>
          <Badge tone="gold">888 · Devoted</Badge>
          <Badge tone="danger">frozen</Badge>
          <Badge tone="sealed">sealed</Badge>
        </div>
      </section>

      <section className="mt-10">
        <Display as="h2" className="mb-3 text-xl">
          Inputs
        </Display>
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
        <Display as="h2" className="mb-3 text-xl">
          Cards
        </Display>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <Display as="h3" className="text-lg">
              Surface
            </Display>
            <Whisper className="mt-1">A resting card.</Whisper>
          </Card>
          <Card raised>
            <Display as="h3" className="text-lg">
              Raised
            </Display>
            <Whisper className="mt-1">Lifted, for focus.</Whisper>
          </Card>
        </div>
      </section>
    </main>
  );
}
