"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { copy } from "@/copy/copy";
import { formatWhen } from "@/lib/format/when";

interface Item {
  id: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  sentAt: string | null;
}

export function InboxList() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/inbox");
        const { notifications } = (await res.json()) as { notifications: Item[] };
        setItems(notifications);
        // Mark everything seen as of now.
        if (notifications[0]?.sentAt) {
          localStorage.setItem("akasha_inbox_seen", new Date().toISOString());
        }
      } catch {
        setItems([]);
      }
    })();
  }, []);

  if (items === null) {
    return <p className="mt-6 text-sm text-text-dim">{copy.system.genericHold}</p>;
  }
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-text-dim">{copy.whispers.empty}</p>;
  }

  return (
    <ul className="mt-6 space-y-2">
      {items.map((n) => {
        const inner = (
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
            <p className="text-sm text-text">{n.title}</p>
            {n.body ? (
              <p className="mt-1 text-sm text-text-dim">{n.body}</p>
            ) : null}
            {n.sentAt ? (
              <p className="mt-1 text-xs text-text-dim/70" suppressHydrationWarning>
                {formatWhen(n.sentAt)}
              </p>
            ) : null}
          </div>
        );
        return (
          <li key={n.id}>
            {n.deepLink ? (
              <Link href={n.deepLink}>{inner}</Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
