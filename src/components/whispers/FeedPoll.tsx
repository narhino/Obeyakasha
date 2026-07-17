"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";
import type { WhisperPollView } from "@/lib/feed/whispers";

/**
 * A poll rendered inline in the Whispers feed (R1).
 * - Signed-in subjects vote once (existing vote path); tallies appear only
 *   after she shares results.
 * - Logged-out visitors see the question with a "connect to speak" CTA
 *   instead of voting controls.
 */
export function FeedPoll({
  poll,
  signedIn,
}: {
  poll: WhisperPollView;
  signedIn: boolean;
}) {
  const [voted, setVoted] = useState<string | null>(poll.myVote);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const closed = poll.status === "closed";
  const showResults = poll.resultsShared && poll.results !== null;

  async function vote(optionId: string) {
    if (busy || closed) return;
    setBusy(true);
    setVoted(optionId);
    try {
      await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-line/70 bg-bg/40 p-3">
      <p className="label-caps text-gold/80">{copy.poll.prompt}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-lg text-text">
        {poll.question}
      </p>

      {!signedIn ? (
        // Logged-out: question is visible, voting is not.
        <>
          <ul className="mt-3 space-y-1.5">
            {poll.options.map((o) => (
              <li
                key={o.id}
                className="rounded-[var(--radius)] border border-line/60 px-3 py-2 text-sm text-text-dim"
              >
                {o.label}
              </li>
            ))}
          </ul>
          <Whisper className="mt-3 text-xs">{copy.poll.connectWhisper}</Whisper>
          <Link href="/signin" className="mt-2 inline-block">
            <Button size="sm" variant="gold">
              {copy.poll.connectCta}
            </Button>
          </Link>
        </>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {poll.options.map((o) => {
              const tally = poll.results?.find((r) => r.optionId === o.id);
              const chosen = voted === o.id;
              return (
                <li key={o.id}>
                  <button
                    onClick={() => vote(o.id)}
                    disabled={busy || closed}
                    className={`w-full rounded-[var(--radius)] border px-3 py-2 text-left text-sm transition-colors duration-[var(--dur-med)] disabled:cursor-not-allowed ${
                      chosen
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-line text-text hover:border-text-dim/60"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>{o.label}</span>
                      {showResults ? (
                        <span className="text-text-dim">
                          {tally?.count ?? 0} · {tally?.pct ?? 0}%
                        </span>
                      ) : null}
                    </span>
                    {showResults ? (
                      <span className="mt-1 block h-1 rounded bg-line">
                        <span
                          className="block h-full rounded bg-gold"
                          style={{ width: `${tally?.pct ?? 0}%` }}
                        />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {closed ? (
            <Whisper className="mt-2 text-xs">{copy.poll.closed}</Whisper>
          ) : voted ? (
            <Whisper className="mt-2 text-xs text-gold">
              {copy.poll.voted}
            </Whisper>
          ) : null}
        </>
      )}
    </div>
  );
}
