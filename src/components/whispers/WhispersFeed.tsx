"use client";

import { useState } from "react";
import type { WhisperCard } from "@/lib/feed/whispers";
import { copy } from "@/copy/copy";

export function WhispersFeed({ items }: { items: WhisperCard[] }) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-text-dim">{copy.whispers.empty}</p>;
  }
  return (
    <ul className="mt-6 space-y-3">
      {items.map((w) => (
        <WhisperItem key={w.id} whisper={w} />
      ))}
    </ul>
  );
}

function WhisperItem({ whisper }: { whisper: WhisperCard }) {
  const [knelt, setKnelt] = useState(whisper.knelt);
  const [busy, setBusy] = useState(false);

  async function doKneel() {
    if (knelt || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/whispers/${whisper.id}/kneel`, { method: "POST" });
      setKnelt(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      {whisper.body ? (
        <p className="text-text">{whisper.body}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-text-dim/70">
          {whisper.publishedAt
            ? new Date(whisper.publishedAt).toLocaleString()
            : ""}
        </span>
        <button
          onClick={doKneel}
          disabled={knelt || busy}
          className={`rounded-[var(--radius-full)] border px-4 py-1.5 text-sm ${
            knelt
              ? "border-gold/40 bg-gold/10 text-gold"
              : "border-line text-text-dim hover:border-gold hover:text-gold"
          }`}
        >
          {knelt ? copy.whispers.knelt : copy.whispers.kneel}
        </button>
      </div>
    </li>
  );
}
