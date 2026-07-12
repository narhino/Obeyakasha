"use client";

import { useState } from "react";
import { Button, Display, Input, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * Initiation intake (F9) — one question per screen, her voice. Sets identity +
 * records the narrative answers, then reveals the app.
 */
const HONORIFICS = ["Goddess", "Mistress", "Akasha", "Miss"];

export function IntakeFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    chosenName: "",
    honorific: "Goddess",
    pronouns: "",
    sinceWhen: "",
    seek: "",
    favorites: "",
    wish: "",
  });

  function set<K extends keyof typeof data>(k: K, v: string) {
    setData((d) => ({ ...d, [k]: v }));
  }

  const steps = [
    {
      title: copy.intake.nameQ,
      body: copy.intake.welcomeBody,
      field: (
        <Input
          autoFocus
          value={data.chosenName}
          onChange={(e) => set("chosenName", e.target.value)}
          placeholder="my subject"
          className="w-full text-center"
        />
      ),
      canNext: data.chosenName.trim().length > 0,
    },
    {
      title: copy.intake.honorificQ,
      field: (
        <div className="flex flex-wrap justify-center gap-2">
          {HONORIFICS.map((h) => (
            <button
              key={h}
              onClick={() => set("honorific", h)}
              className={`rounded-[var(--radius-full)] border px-4 py-2 text-sm ${
                data.honorific === h
                  ? "border-gold bg-gold/15 text-gold"
                  : "border-line text-text-dim"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      ),
      canNext: true,
    },
    {
      title: copy.intake.knownQ,
      field: (
        <Input
          value={data.sinceWhen}
          onChange={(e) => set("sinceWhen", e.target.value)}
          placeholder="since…"
          className="w-full text-center"
        />
      ),
      canNext: true,
    },
    {
      title: copy.intake.seekQ,
      field: (
        <Textarea value={data.seek} onChange={(v) => set("seek", v)} />
      ),
      canNext: true,
    },
    {
      title: copy.intake.favoritesQ,
      field: (
        <Textarea value={data.favorites} onChange={(v) => set("favorites", v)} />
      ),
      canNext: true,
    },
    {
      title: copy.intake.wishQ,
      field: <Textarea value={data.wish} onChange={(v) => set("wish", v)} />,
      canNext: true,
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  async function next() {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />
      {step === 0 ? (
        <Whisper className="mb-4 text-base italic">{copy.intake.welcome}</Whisper>
      ) : null}
      <div className="w-full max-w-sm">
        <Display className="text-2xl">{current.title}</Display>
        <div className="mt-6">{current.field}</div>
        <div className="mt-8 flex items-center justify-center gap-3">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-text-dim/70"
            >
              back
            </button>
          ) : null}
          <Button
            variant="gold"
            size="lg"
            disabled={!current.canNext || saving}
            onClick={next}
          >
            {isLast ? copy.intake.done : "Continue"}
          </Button>
        </div>
        <p className="mt-6 text-xs text-text-dim/60">
          {step + 1} / {steps.length}
        </p>
      </div>
    </div>
  );
}

function Textarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
    />
  );
}
