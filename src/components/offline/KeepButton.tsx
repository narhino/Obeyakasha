"use client";

import { useEffect, useState } from "react";
import { getDeviceId } from "@/lib/pwa/client";
import { isKept, keepTrack, removeTrack } from "@/lib/offline/store";
import { IconCheck, IconKeep } from "@/components/ui/icons";

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
      className={`flex shrink-0 items-center gap-1 text-[0.6875rem] tracking-[0.1em] uppercase transition-colors duration-[var(--dur-med)] ${
        state === "kept" ? "text-gold" : "text-text-dim hover:text-gold"
      }`}
      title="Keep offline"
    >
      {state === "kept" ? (
        <>
          <IconCheck size={13} /> kept
        </>
      ) : state === "working" ? (
        "…"
      ) : (
        <>
          <IconKeep size={13} /> keep
        </>
      )}
    </button>
  );
}
