"use client";

import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/pwa/client";
import { isKept, keepTrack, removeTrack } from "@/lib/offline/store";

/** "Keep with you" — YouTube-style in-app offline (D4). */
export function KeepButton({ trackId }: { trackId: string }) {
  const [state, setState] = useState<"idle" | "kept" | "working">("idle");

  useEffect(() => {
    isKept(trackId).then((k) => setState(k ? "kept" : "idle"));
  }, [trackId]);

  async function toggle() {
    if (state === "working") return;
    if (state === "kept") {
      await removeTrack(trackId);
      setState("idle");
      return;
    }
    setState("working");
    try {
      const res = await fetch("/api/offline/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, deviceId: getDeviceId() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        ttlDays?: number;
      };
      if (!data.ok || !data.url) {
        setState("idle");
        return;
      }
      await keepTrack(trackId, data.url, data.ttlDays ?? 14);
      setState("kept");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={toggle}
      className="shrink-0 text-xs text-text-dim hover:text-gold"
      title="Keep offline"
    >
      {state === "kept" ? "✓ kept" : state === "working" ? "…" : "↓ keep"}
    </button>
  );
}
