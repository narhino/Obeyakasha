"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconSpark } from "@/components/ui/icons";

/**
 * Header bell with an unseen dot. "Seen" is tracked client-side (localStorage)
 * against the newest notification timestamp — no schema needed for M2.
 */
export function InboxBell() {
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inbox");
        if (!res.ok) return;
        const { notifications } = (await res.json()) as {
          notifications: { sentAt: string | null }[];
        };
        const newest = notifications[0]?.sentAt;
        if (cancelled || !newest) return;
        const seen = localStorage.getItem("akasha_inbox_seen");
        if (!seen || new Date(newest) > new Date(seen)) setHasUnseen(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
