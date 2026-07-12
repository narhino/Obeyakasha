"use client";

import { usePlayer } from "@/lib/player/store";
import type { ProgramView } from "@/lib/programs/queries";
import { IconCheck, IconLock, IconPlay } from "@/components/ui/icons";

function fmtWhen(ms: number | null): string {
  if (!ms) return "";
  const hours = Math.max(0, Math.ceil((ms - Date.now()) / (60 * 60 * 1000)));
  if (hours <= 0) return "soon";
  if (hours < 24) return `opens in ${hours}h`;
  return `opens in ${Math.ceil(hours / 24)}d`;
}

export function ProgramsClient({ programs }: { programs: ProgramView[] }) {
  const playNow = usePlayer((s) => s.playNow);

  if (programs.length === 0) {
    return <p className="text-sm text-text-dim">No trainings open yet. Soon.</p>;
  }

  return (
    <div className="space-y-6">
      {programs.map((p) => (
        <section
          key={p.id}
          className="rounded-[var(--radius-lg)] border border-line bg-surface p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-text">
              {p.title}
            </h2>
            <span className="text-xs text-text-dim">
              {p.completedCount}/{p.items.length}
            </span>
          </div>
          {p.description ? (
            <p className="mt-1 text-sm text-text-dim">{p.description}</p>
          ) : null}

          <ol className="mt-3 space-y-1.5">
            {p.items.map((it) => (
              <li
                key={it.trackId}
                className="flex items-center gap-3 rounded-[var(--radius)] border border-line/60 px-3 py-2"
              >
                <button
                  disabled={!it.unlocked}
                  onClick={() =>
                    playNow(
                      [
                        {
                          id: it.trackId,
                          title: it.title,
                          durationS: it.durationS,
                          artworkKey: null,
                        },
                      ],
                      0,
                    )
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold text-bg transition-colors duration-[var(--dur-med)] hover:bg-gold-deep disabled:bg-surface-raised disabled:text-text-dim/60"
                  aria-label={`Play ${it.title}`}
                >
                  {it.completed ? (
                    <IconCheck size={14} />
                  ) : it.unlocked ? (
                    <IconPlay size={14} />
                  ) : (
                    <IconLock size={14} />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">
                    {it.dayNumber ? `Day ${it.dayNumber} · ` : ""}
                    {it.title}
                  </p>
                  {!it.unlocked ? (
                    <p className="text-xs text-text-dim">
                      {!it.accessAllowed
                        ? `sealed · level ${it.minAccessLevel}`
                        : fmtWhen(it.unlocksAt)}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
