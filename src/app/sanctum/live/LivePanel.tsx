"use client";

import { useCallback, useRef, useState } from "react";
import { usePolling } from "@/lib/hooks/usePolling";
import { Badge, Button, Card, Input, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";
import type { LiveListener } from "@/lib/listen/live";

/**
 * "Now, under" (R9.1) — the goddess watches who is listening in real time and
 * reaches into a session with one tap. Polls the goddess-gated live route every
 * ~10s (reusing the shared polling hook). `compact` is the Today teaser (preset
 * lines only); the full /sanctum/live room adds a depth read-out and a free-text
 * line. Admin-only surface — subject collar names never leave the Sanctum (D7).
 */
export function LivePanel({
  initial,
  compact = false,
}: {
  initial: LiveListener[];
  compact?: boolean;
}) {
  const [live, setLive] = useState<LiveListener[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const clearTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/sanctum/live", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { live: LiveListener[] };
      setLive(data.live);
    } catch {
      /* transient — the next poll retries */
    }
  }, []);
  usePolling(() => void refetch(), 10000);

  const touch = useCallback(async (userId: string, text: string) => {
    const line = text.trim();
    if (!line) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sanctum/live/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text: line }),
      });
      if (res.ok) {
        setDrafts((m) => ({ ...m, [userId]: "" }));
        setSent((m) => ({ ...m, [userId]: true }));
        clearTimeout(clearTimers.current[userId]);
        clearTimers.current[userId] = setTimeout(
          () => setSent((m) => ({ ...m, [userId]: false })),
          3500,
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  if (live.length === 0) {
    return (
      <Card>
        <Whisper>No one is under right now. The room is still.</Whisper>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {live.map((l) => (
        <Card key={l.sessionId} raised>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-[family-name:var(--font-display)] text-lg">
                {l.name}
              </p>
              <Whisper className="truncate text-xs">
                {l.trackTitle} · {l.minutesIn} min in
                {!compact && l.depthPct != null ? ` · ${l.depthPct}% deep` : ""}
              </Whisper>
              {!compact && l.depthPct != null ? (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line/60">
                  <div
                    className="h-full rounded-full bg-gold/70"
                    style={{ width: `${l.depthPct}%` }}
                  />
                </div>
              ) : null}
            </div>
            <Badge tone="gold">under</Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {copy.touch.presets.map((p) => (
              <Button
                key={p}
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void touch(l.userId, p)}
              >
                {p}
              </Button>
            ))}
          </div>

          {!compact ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void touch(l.userId, drafts[l.userId] ?? "");
              }}
            >
              <Input
                value={drafts[l.userId] ?? ""}
                onChange={(e) =>
                  setDrafts((m) => ({ ...m, [l.userId]: e.target.value }))
                }
                placeholder="Say it to her, quietly…"
                maxLength={240}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                variant="gold"
                disabled={busy || !(drafts[l.userId] ?? "").trim()}
              >
                Touch
              </Button>
            </form>
          ) : null}

          {sent[l.userId] ? (
            <Whisper className="mt-2 text-xs text-gold">She felt it.</Whisper>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
