"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/player/store";
import { beacon, postJson } from "@/lib/player/telemetry";
import { MiniBar } from "./MiniBar";
import { Fullscreen } from "./Fullscreen";
import { DropPrompt } from "./DropPrompt";

/**
 * The single audio engine (PLAN §9), mounted once in the subject layout.
 * Owns the <audio> element and reconciles it with the player store: loads
 * signed stream URLs, play/pause, progress + heartbeats, end handling, Media
 * Session, and the sleep timer. UI (MiniBar/Fullscreen) only dispatches store
 * actions.
 */
export function PlayerRoot() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const lastBeatRef = useRef(0);
  const listenedRef = useRef(0);
  const sleepDeadlineRef = useRef<number | null>(null);

  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const endMode = usePlayer((s) => s.endMode);
  const sleepTimerMin = usePlayer((s) => s.sleepTimerMin);
  const grounding = usePlayer((s) => s.grounding);

  // Load a new track's signed URL when `current` changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (loadedTrackIdRef.current === current.id) return;

    // Finalize the previous session as "stopped" (switching tracks).
    finalize("stopped");

    loadedTrackIdRef.current = current.id;
    sessionIdRef.current = crypto.randomUUID();
    listenedRef.current = 0;
    lastBeatRef.current = 0;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tracks/${current.id}/stream-url`);
        if (!res.ok) return;
        const { url } = (await res.json()) as { url: string };
        if (cancelled) return;
        audio.src = url;
        if (usePlayer.getState().playing) await audio.play().catch(() => {});
      } catch {
        // ignore; UI shows paused
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Play / pause reconciliation.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (grounding) return; // grounding overlay controls audio
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [playing, grounding]);

  // Sleep timer.
  useEffect(() => {
    if (sleepTimerMin == null) {
      sleepDeadlineRef.current = null;
      return;
    }
    sleepDeadlineRef.current = Date.now() + sleepTimerMin * 60_000;
  }, [sleepTimerMin]);

  // Media Session metadata + handlers.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: "AKASHA",
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => usePlayer.getState().setPlaying(true));
    ms.setActionHandler("pause", () => usePlayer.getState().setPlaying(false));
    ms.setActionHandler("previoustrack", () => usePlayer.getState().prev());
    ms.setActionHandler("nexttrack", () => usePlayer.getState().next());
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, [current]);

  // Flush an "abandoned" end on tab close.
  useEffect(() => {
    const onHide = () => {
      const audio = audioRef.current;
      if (sessionIdRef.current && current && audio) {
        beacon("/api/listen/end", {
          sessionId: sessionIdRef.current,
          trackId: current.id,
          positionS: Math.round(audio.currentTime),
          endReason: "abandoned",
        });
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [current]);

  function finalize(reason: "finished" | "stopped" | "grounded" | "abandoned") {
    const audio = audioRef.current;
    const sessionId = sessionIdRef.current;
    const trackId = loadedTrackIdRef.current;
    if (!audio || !sessionId || !trackId) return;
    void postJson("/api/listen/end", {
      sessionId,
      trackId,
      positionS: Math.round(audio.currentTime),
      endReason: reason,
    });
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    usePlayer.getState().setProgress(audio.currentTime, audio.duration || 0);

    // Sleep timer check.
    if (
      sleepDeadlineRef.current != null &&
      Date.now() >= sleepDeadlineRef.current
    ) {
      sleepDeadlineRef.current = null;
      usePlayer.getState().setSleepTimer(null);
      usePlayer.getState().setPlaying(false);
      finalize("stopped");
      return;
    }

    // Heartbeat every ~10s of playback.
    const now = audio.currentTime;
    if (now - lastBeatRef.current >= 10) {
      listenedRef.current += now - lastBeatRef.current;
      lastBeatRef.current = now;
      if (sessionIdRef.current) {
        void postJson("/api/listen/heartbeat", {
          sessionId: sessionIdRef.current,
          trackId: current.id,
          positionS: now,
          secondsListened: Math.round(listenedRef.current),
        });
      }
    }
  }

  function onEnded() {
    const state = usePlayer.getState();
    const audio = audioRef.current;
    finalize("finished");

    // Offer a drop report for this finished session.
    const sessionId = sessionIdRef.current;
    const trackId = loadedTrackIdRef.current;
    if (sessionId && trackId && current) {
      window.dispatchEvent(
        new CustomEvent("akasha:drop-prompt", {
          detail: { sessionId, trackId, title: current.title },
        }),
      );
    }

    if (state.endMode === "repeatTrack" && audio) {
      // Restart the same audio under a fresh session; don't re-load the URL.
      sessionIdRef.current = crypto.randomUUID();
      listenedRef.current = 0;
      lastBeatRef.current = 0;
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }

    // Prevent the next load effect from double-finalizing this session.
    sessionIdRef.current = null;
    loadedTrackIdRef.current = null;
    state.onTrackEnded();
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        preload="metadata"
      />
      <MiniBar />
      <Fullscreen />
      <DropPrompt />
    </>
  );
}
