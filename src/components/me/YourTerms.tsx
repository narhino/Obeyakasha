"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button, Input, Whisper } from "@/components/ui";
import { IconChevronDown } from "@/components/ui/icons";
import { purgeAll } from "@/lib/offline/store";
import { copy } from "@/copy/copy";

// Theme taxonomy (content keys, not prose) — the limits she must never touch.
const THEMES = ["chastity", "findom", "transformation", "sleep", "humiliation"];

/**
 * "Your terms" (F5) — the tucked-away purple collapsible at the foot of the
 * Mirror. Collapsed by default behind one quiet violet line; opens to the quiet,
 * private controls that used to be Settings: quiet hours, limits (themes she
 * must never touch), and the GDPR pieces (export + release). All the old
 * endpoints, intact (/api/me PATCH, /api/me/export, /api/me/delete) — only the
 * home changed, and the words are now hers. Muted amethyst (`--terms-*`), used
 * nowhere else, so it reads as set apart and private.
 */
export function YourTerms({
  timezone,
  quietStart,
  quietEnd,
  initialOptouts = [],
}: {
  timezone: string;
  quietStart: number;
  quietEnd: number;
  initialOptouts?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [tz, setTz] = useState(timezone);
  const [qs, setQs] = useState(quietStart);
  const [qe, setQe] = useState(quietEnd);
  const [optouts, setOptouts] = useState<string[]>(initialOptouts);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timezone: tz,
        quietHoursStart: qs,
        quietHoursEnd: qe,
        themeOptouts: optouts,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function release() {
    await purgeAll().catch(() => {});
    await fetch("/api/me/delete", { method: "POST" });
    await signOut({ callbackUrl: "/" });
  }

  return (
    <section className="mt-10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border bg-[var(--terms-surface)] px-4 py-3.5 text-left shadow-[var(--terms-glow)] transition-colors duration-[var(--dur-med)]"
        style={{ borderColor: "var(--terms-line)" }}
      >
        <span className="min-w-0">
          <span className="block font-[family-name:var(--font-display)] text-base italic text-terms">
            {copy.terms.label}
          </span>
          <span className="mt-0.5 block text-xs text-terms/70">
            {copy.terms.hint}
          </span>
        </span>
        <IconChevronDown
          size={18}
          className={`shrink-0 text-terms transition-transform duration-[var(--dur-med)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div
          className="mt-3 space-y-5 rounded-[var(--radius-lg)] border bg-[var(--terms-surface)] p-5"
          style={{ borderColor: "var(--terms-line)" }}
        >
          {/* Quiet hours — the notification choice, moved intact. */}
          <div>
            <p className="label-caps text-terms/80">{copy.terms.quietTitle}</p>
            <Whisper className="mt-1">{copy.terms.quietBody}</Whisper>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-text-dim">
                {copy.terms.quietFrom}
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={qs}
                  onChange={(e) => setQs(Number(e.target.value))}
                  className="w-20"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-text-dim">
                {copy.terms.quietTo}
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={qe}
                  onChange={(e) => setQe(Number(e.target.value))}
                  className="w-20"
                />
              </label>
            </div>
            <label className="mt-3 block text-xs text-text-dim">
              {copy.terms.timezone}
              <Input
                value={tz}
                onChange={(e) => setTz(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          </div>

          {/* Limits — themes she must never touch, moved intact. */}
          <div className="border-t pt-5" style={{ borderColor: "var(--terms-line)" }}>
            <p className="label-caps text-terms/80">{copy.terms.limitsTitle}</p>
            <Whisper className="mt-1 text-xs">{copy.terms.limitsBody}</Whisper>
            <div className="mt-3 flex flex-wrap gap-2">
              {THEMES.map((t) => {
                const off = optouts.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={off}
                    onClick={() =>
                      setOptouts((o) =>
                        o.includes(t) ? o.filter((x) => x !== t) : [...o, t],
                      )
                    }
                    className={`rounded-[var(--radius-full)] border px-3 py-1.5 text-xs transition-colors duration-[var(--dur-med)] ${
                      off
                        ? "border-attention bg-attention/10 text-attention"
                        : "border-line text-text-dim hover:border-attention/50 hover:text-text"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <Button variant="gold" onClick={save}>
            {saved ? copy.terms.saved : copy.terms.save}
          </Button>

          {/* GDPR — export + release, moved intact. */}
          <div className="border-t pt-5" style={{ borderColor: "var(--terms-line)" }}>
            <p className="label-caps text-terms/80">{copy.terms.dataTitle}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href="/api/me/export" download>
                <Button variant="ghost" size="sm">
                  {copy.terms.export}
                </Button>
              </a>
              {!confirmDelete ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  {copy.terms.release}
                </Button>
              ) : (
                <Button variant="danger" size="sm" onClick={release}>
                  {copy.terms.releaseConfirm}
                </Button>
              )}
            </div>
            <Whisper className="mt-2 text-xs">{copy.terms.releaseNote}</Whisper>
          </div>
        </div>
      ) : null}
    </section>
  );
}
