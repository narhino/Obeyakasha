"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button, Card, Input, Whisper } from "@/components/ui";
import { purgeAll } from "@/lib/offline/store";

const THEMES = ["chastity", "findom", "transformation", "sleep", "humiliation"];

export function SettingsClient({
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
    <div className="mt-6 space-y-6">
      <Card>
        <Whisper className="text-xs uppercase tracking-wide">Quiet hours</Whisper>
        <Whisper className="mt-1">She won&apos;t wake you during these hours.</Whisper>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={23}
            value={qs}
            onChange={(e) => setQs(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-text-dim">to</span>
          <Input
            type="number"
            min={0}
            max={23}
            value={qe}
            onChange={(e) => setQe(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <label className="mt-3 block text-xs text-text-dim">
          Timezone
          <Input value={tz} onChange={(e) => setTz(e.target.value)} className="mt-1 w-full" />
        </label>
      </Card>

      <Card>
        <Whisper className="text-xs uppercase tracking-wide">
          What she must never touch
        </Whisper>
        <Whisper className="mt-1 text-xs">
          Tap to mark a theme off-limits. Marked ones glow red — she&apos;ll never
          send you there.
        </Whisper>
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
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-line text-text-dim hover:border-danger/50 hover:text-text"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Card>

      <Button variant="gold" onClick={save}>
        {saved ? "Saved" : "Save"}
      </Button>

      <Card>
        <Whisper className="text-xs uppercase tracking-wide">Your data</Whisper>
        <div className="mt-3 flex flex-wrap gap-3">
          <a href="/api/me/export" download>
            <Button variant="ghost" size="sm">
              Export my data
            </Button>
          </a>
          {!confirmDelete ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              Release me
            </Button>
          ) : (
            <Button variant="danger" size="sm" onClick={release}>
              This erases everything — confirm
            </Button>
          )}
        </div>
        <Whisper className="mt-2 text-xs">
          Releasing deletes your account and everything on it, forever.
        </Whisper>
      </Card>
    </div>
  );
}
