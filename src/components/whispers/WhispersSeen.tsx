"use client";

import { useEffect } from "react";

/**
 * Marks the Whispers feed seen (F5). Mounted on the signed-in Home; on mount it
 * stamps `lastSeenWhispersAt = now` so the Whispers tab's red burn clears once
 * they've actually looked. Fire-and-forget — a failed mark just leaves the glow
 * for next time. Renders nothing.
 */
export function WhispersSeen() {
  useEffect(() => {
    void fetch("/api/whispers/seen", { method: "POST" }).catch(() => {});
  }, []);
  return null;
}
