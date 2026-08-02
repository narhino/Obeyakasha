"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Whisper } from "@/components/ui";
import { replyToThread } from "@/app/sanctum/messages/actions";
import type { ReplyDraft } from "@/lib/llm/reply";

/** What each draft is trying to do, in her words. */
const ANGLE_LABEL: Record<ReplyDraft["angle"], string> = {
  close: "Hold him",
  deepen: "Pull him deeper",
  command: "Take control",
};

/**
 * Reply box (F11). She can request AI drafts (never auto-sent), pick/edit one,
 * and send. Drafts are hidden when a thread is safety-flagged.
 *
 * Each draft arrives as a distinct MOVE — hold him / pull him deeper / take
 * control — with one line on why it lands on this particular man. She is
 * choosing an intention, not skimming three phrasings of the same sentence.
 */
export function ReplyBox({
  threadId,
  safetyFlagged,
  subjectId,
  notesCount = 0,
}: {
  threadId: string;
  safetyFlagged: boolean;
  /** Whose thread this is — the way to their file, and to add to it. */
  subjectId?: string;
  /** How much she has written down about him. Drives the nudge below. */
  notesCount?: number;
}) {
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<ReplyDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function propose() {
    setLoading(true);
    setNote(null);
    try {
      const res = await fetch("/api/sanctum/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      const data = (await res.json()) as {
        configured: boolean;
        drafts: ReplyDraft[] | null;
      };
      if (!data.configured) {
        setNote("Add an ANTHROPIC_API_KEY to enable AI drafts.");
      } else if (!data.drafts || data.drafts.length === 0) {
        setNote("Couldn't draft right now.");
      } else {
        setDrafts(data.drafts);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={replyToThread} className="mt-6">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        required
        placeholder="Answer…"
        className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" variant="gold" size="sm">
          Send
        </Button>
        {!safetyFlagged ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={propose}
          >
            {loading ? "Thinking…" : "Propose replies"}
          </Button>
        ) : null}
      </div>
      {note ? <Whisper className="mt-2 text-xs">{note}</Whisper> : null}
      {drafts ? (
        <div className="mt-3 space-y-2">
          <Whisper className="text-xs uppercase tracking-wide">
            Three different moves — pick one, edit freely
          </Whisper>
          {drafts.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setBody(d.text)}
              className="block w-full rounded-[var(--radius)] border border-line bg-surface p-2.5 text-left transition-colors duration-[var(--dur-med)] hover:border-gold"
            >
              <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-gold/75">
                {ANGLE_LABEL[d.angle]}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-text">
                {d.text}
              </span>
              {d.why ? (
                <span className="mt-1.5 block text-xs italic text-text-dim/70">
                  {d.why}
                </span>
              ) : null}
            </button>
          ))}
          {/* The drafts are only as sharp as what she has written down about
              him — said once, where it pays off, not as a nag. */}
          {subjectId && notesCount === 0 ? (
            <Whisper className="text-xs">
              These read his whole history — but nothing you know that the app
              can&apos;t see.{" "}
              <Link
                href={`/sanctum/subjects/${subjectId}#file`}
                className="text-gold underline underline-offset-2"
              >
                Put it in his file
              </Link>{" "}
              and every draft after this one uses it.
            </Whisper>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
