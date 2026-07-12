"use client";

import { useState } from "react";
import { Button, Whisper } from "@/components/ui";
import { replyToThread } from "@/app/sanctum/messages/actions";

/**
 * Reply box (F11). She can request AI drafts (never auto-sent), pick/edit one,
 * and send. Drafts are hidden when a thread is safety-flagged.
 */
export function ReplyBox({
  threadId,
  safetyFlagged,
}: {
  threadId: string;
  safetyFlagged: boolean;
}) {
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<string[] | null>(null);
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
        drafts: string[] | null;
      };
      if (!data.configured) {
        setNote("Add an ANTHROPIC_API_KEY to enable AI drafts.");
      } else if (!data.drafts) {
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
            Drafts — pick one, edit freely
          </Whisper>
          {drafts.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setBody(d)}
              className="block w-full rounded-[var(--radius)] border border-line bg-surface p-2 text-left text-sm text-text-dim hover:border-gold hover:text-text"
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
