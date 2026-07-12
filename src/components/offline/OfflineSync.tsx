"use client";

import { useEffect } from "react";
import { purgeInvalid } from "@/lib/offline/store";

/**
 * Revalidate kept tracks on each launch (D4/§10.4). Anything no longer
 * entitled (lapse/frozen/unpublished/expired) is purged from the device.
 */
export function OfflineSync() {
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/offline/sync", { method: "POST" });
        if (!res.ok) return;
        const { valid } = (await res.json()) as { valid: string[] };
        await purgeInvalid(valid);
      } catch {
        /* offline or error — keep what we have until next successful sync */
      }
    })();
  }, []);
  return null;
}
