"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconSpark } from "@/components/ui/icons";
import { usePolling } from "@/lib/hooks/usePolling";

/**
 * Header bell with an unseen dot. "Seen" is tracked client-side (localStorage)
 * against the newest notification timestamp — no schema needed for M2.
 */
export function InboxBell() {
  const [hasUnseen, setHasUnseen] = useState(false);

  // Poll so a notification that arrives while the app is open lights the dot on
  // its own — no navigation needed. usePolling pauses while the tab is hidden
  // and re-checks the instant it's shown again.
  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (!res.ok) return;
      const { notifications } = (await res.json()) as {
        notifications: { sentAt: string | null }[];
      };
      const newest = notifications[0]?.sentAt;
      if (!newest) return;
      const seen = localStorage.getItem("akasha_inbox_seen");
      setHasUnseen(!seen || new Date(newest) > new Date(seen));
    } catch {
      /* transient — the next poll retries */
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  usePolling(() => void check(), 30_000);

  return (
    <Link
      href="/inbox"
      className="relative text-text-dim transition-colors duration-[var(--dur-med)] hover:text-gold"
      aria-label="Notifications"
    >
      <IconSpark size={18} />
      {hasUnseen ? (
        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_8px_rgba(212,175,106,0.8)]" />
      ) : null}
    </Link>
  );
}
