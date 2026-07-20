"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePolling } from "@/lib/hooks/usePolling";

/**
 * Presence context (F4). Polls "is the Goddess on the app?" once for the whole
 * subject shell and shares the boolean with the band, the Whispers nav glow, and
 * the arrival overlay. `enabled` is true only for subjects (never anonymous,
 * never the goddess herself) — when off, everyone reads offline and no poll runs.
 *
 * The endpoint returns a bare boolean: no timestamp, nothing about anyone else (D7).
 */
const PresenceContext = createContext<{ online: boolean }>({ online: false });

export function usePresence(): { online: boolean } {
  return useContext(PresenceContext);
}

export function PresenceProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState(false);

  const check = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/presence/goddess", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { online?: boolean };
      setOnline(Boolean(data.online));
    } catch {
      /* transient — the next poll retries */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setOnline(false);
      return;
    }
    void check(); // on load
  }, [enabled, check]);

  // Every 60s while visible, and once the moment the tab is re-shown.
  usePolling(() => void check(), 60_000);

  return (
    <PresenceContext.Provider value={{ online: enabled && online }}>
      {children}
    </PresenceContext.Provider>
  );
}
