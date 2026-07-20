"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/lib/hooks/usePolling";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { formatWhen } from "@/lib/format/when";
import type { RoomSubject } from "@/lib/presence/room";

/**
 * "In the room" (F4) — the subjects present with her right now, freshest first,
 * with the name she gave them, their level, and a quiet "seen …". Polls the
 * goddess-gated room route every 60s (reusing the shared hook) and fails soft: a
 * transient error just keeps the last list. The live count sits in the heading;
 * the cloak toggle is passed in as `cloakSlot` so it sits beside this card.
 *
 * Admin-only — collar names and levels never leave the Sanctum (D7). The cloak
 * does not hide anyone here; she always sees the room, even while dark to them.
 */
export function RoomPanel({
  initial,
  cloakSlot,
}: {
  initial: RoomSubject[];
  cloakSlot?: React.ReactNode;
}) {
  const [room, setRoom] = useState<RoomSubject[]>(initial);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/sanctum/presence/room", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { room: RoomSubject[] };
      setRoom(data.room);
    } catch {
      /* transient — the next poll retries */
    }
  }, []);
  usePolling(() => void refetch(), 60_000);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <Display as="h2" className="text-xl">
            In the room
          </Display>
          <Badge tone={room.length > 0 ? "gold" : "neutral"}>{room.length}</Badge>
        </div>
        {cloakSlot}
      </div>
      <div className="mt-3">
        {room.length === 0 ? (
          <Card>
            <Whisper>No one is here right now. The room is empty.</Whisper>
          </Card>
        ) : (
          <Card className="divide-y divide-line/60 p-0">
            {room.map((s) => (
              <div
                key={s.userId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-lg">
                    {s.name}
                  </p>
                  <Whisper className="text-xs">seen {formatWhen(s.lastSeenAt)}</Whisper>
                </div>
                <Badge tone="gold">level {s.level}</Badge>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
