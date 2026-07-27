"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { copy } from "@/copy/copy";

interface Msg {
  id: string;
  sender: "subject" | "goddess";
  body: string | null;
  /** What she was answering (an ask), quoted above her words. */
  contextNote?: string | null;
  createdAt: string;
}

export function MessageThread() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/thread");
      const { messages } = (await res.json()) as { messages: Msg[] };
      setMsgs(messages);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send() {
    if (!value.trim() || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value }),
      });
      const data = (await res.json()) as { ok: boolean; reason?: string };
      if (!data.ok && data.reason === "limit") {
        setNotice(copy.messages.limitReached);
      } else {
        setValue("");
        await load();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col">
      <div className="min-h-[40dvh] space-y-2">
        {msgs.length === 0 ? (
          <p className="text-sm text-text-dim">{copy.messages.empty}</p>
        ) : (
          msgs.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-[var(--radius-lg)] px-3 py-2 text-sm ${
                m.sender === "goddess"
                  ? "ml-auto bg-accent text-text"
                  : "mr-auto border border-line bg-surface text-text"
              }`}
            >
              {m.contextNote ? (
                <p className="mb-1.5 border-l-2 border-gold/40 pl-2 text-xs italic text-text-dim">
                  {m.contextNote}
                </p>
              ) : null}
              {m.body}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {notice ? (
        <p className="mt-3 text-xs text-gold">{notice}</p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={2}
          placeholder={copy.messages.placeholder}
          className="flex-1 rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
        />
        <Button variant="gold" disabled={sending || !value.trim()} onClick={send}>
          Send
        </Button>
      </div>
    </div>
  );
}
