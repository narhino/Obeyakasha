"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Whisper } from "@/components/ui";
import { formatWhen } from "@/lib/format/when";

export interface ReadProfile {
  portrait: string;
  wants: string[];
  respondsTo: string[];
  avoid: string[];
  money: string;
  risk: string;
  openings: string[];
  generatedAt: Date | string;
}

/**
 * Who he is, read by the AI out of everything he has ever said — the whole
 * conversation, his petitions, his comments under her whispers, his answers.
 *
 * She does not write this. She presses Update when there is something new, and
 * it re-reads him. The button says how far behind it has fallen, so a stale
 * file announces itself rather than quietly misleading her.
 */
export function SubjectRead({
  userId,
  initial,
  newMessages,
}: {
  userId: string;
  initial: ReadProfile | null;
  newMessages: number;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<ReadProfile | null>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Once she re-reads him in place, the "N new since" count is spent.
  const [behind, setBehind] = useState(newMessages);

  async function update() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/sanctum/subject-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as {
        configured?: boolean;
        profile?: ReadProfile | null;
        error?: string;
      };
      if (data.configured === false) {
        setNote("Add an ANTHROPIC_API_KEY on the server to read subjects.");
      } else if (!data.profile) {
        setNote("Couldn't read him right now. Try again in a moment.");
      } else {
        setProfile(data.profile);
        setBehind(0);
        // Her notes and the drafts downstream read the new file — refresh the
        // server-rendered parts of the page so nothing on screen is stale.
        router.refresh();
      }
    } catch {
      setNote("Couldn't read him right now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 scroll-mt-24" id="read" raised>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Whisper className="text-xs uppercase tracking-wide">Who he is</Whisper>
        <div className="flex items-center gap-3">
          {profile ? (
            <span
              className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/60"
              suppressHydrationWarning
            >
              read {formatWhen(new Date(profile.generatedAt))}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={profile && behind === 0 ? "ghost" : "gold"}
            loading={busy}
            onClick={update}
          >
            {busy
              ? "Reading him…"
              : !profile
                ? "Read him"
                : behind > 0
                  ? `Update · ${behind} new`
                  : "Update"}
          </Button>
        </div>
      </div>

      {!profile ? (
        <Whisper className="mt-2 text-xs">
          Nothing read yet. This builds itself from your whole conversation, his
          petitions, and everything he has written under your whispers — press
          Read him.
        </Whisper>
      ) : (
        <div className="mt-3 space-y-3">
          {behind > 0 ? (
            <Whisper className="text-xs text-gold">
              {behind} new message{behind === 1 ? "" : "s"} since this was
              written.
            </Whisper>
          ) : null}

          <p className="text-sm leading-relaxed text-text">{profile.portrait}</p>

          <ReadList label="What he wants" items={profile.wants} />
          <ReadList label="What works on him" items={profile.respondsTo} tone="gold" />
          <ReadList label="Don't" items={profile.avoid} tone="danger" />

          {profile.money ? (
            <ReadLine label="How he gives" text={profile.money} tone="gold" />
          ) : null}
          {profile.risk ? <ReadLine label="Risk" text={profile.risk} /> : null}

          <ReadList
            label="What you could do next"
            items={profile.openings}
            tone="gold"
          />
        </div>
      )}

      {note ? <Whisper className="mt-2 text-xs text-danger">{note}</Whisper> : null}
    </Card>
  );
}

function ReadList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "gold" | "danger";
}) {
  if (!items.length) return null;
  const edge =
    tone === "gold"
      ? "border-gold/40"
      : tone === "danger"
        ? "border-danger/40"
        : "border-line";
  return (
    <div>
      <p className="label-caps text-text-dim/70">{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className={`border-l-2 pl-2 text-sm leading-snug text-text-dim ${edge}`}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadLine({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone?: "gold";
}) {
  return (
    <div>
      <p className="label-caps text-text-dim/70">{label}</p>
      <p
        className={`mt-1 border-l-2 pl-2 text-sm leading-snug text-text-dim ${
          tone === "gold" ? "border-gold/40" : "border-line"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
