"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePlayer } from "@/lib/player/store";
import { beacon, postJson } from "@/lib/player/telemetry";
import { offlineBlobUrl } from "@/lib/offline/store";
import { MiniBar } from "./MiniBar";
import { Fullscreen } from "./Fullscreen";
import { DropPrompt } from "./DropPrompt";
import { QueueSheet } from "./QueueSheet";
import { Toaster } from "./Toaster";
import { Touch } from "@/components/moments/Touch";

/** Surfaces that must never wear the subject mini-player: the Sanctum cockpit
 *  (its own verify player) and the full-screen ritual / auth screens. The audio
 *  engine keeps running regardless — only the visible chrome steps aside. */
function chromelessPath(pathname: string): boolean {
  return (
    pathname.startsWith("/sanctum") ||
    pathname === "/signin" ||
    pathname === "/about" ||
    pathname === "/threshold"
  );
}

/** Seconds buffered ahead of (and covering) the playhead. */
function bufferedAheadOf(audio: HTMLAudioElement): number {
  try {
    const ranges = audio.buffered;
    const ct = audio.currentTime;
    for (let i = 0; i < ranges.length; i++) {
      if (ct >= ranges.start(i) - 0.25 && ct <= ranges.end(i)) return ranges.end(i);
    }
    return ranges.length > 0 ? ranges.end(ranges.length - 1) : 0;
  } catch {
    return 0;
  }
}

/**
 * The single audio engine (PLAN §9), mounted once in the subject layout.
 * Owns the <audio> element and reconciles it with the player store: loads
 * signed stream URLs, play/pause, progress + heartbeats, end handling, Media
 * Session, and the sleep timer. UI (MiniBar/Fullscreen) only dispatches store
 * actions.
 */
export function PlayerRoot() {
  const pathname = usePathname();
  const chromeless = chromelessPath(pathname);
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
  const volume = usePlayer((s) => s.volume);
  const seekRequest = usePlayer((s) => s.seekRequest);

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
        // Prefer a kept, offline copy (works with no network).
        const offline = await offlineBlobUrl(current.id).catch(() => null);
        let src = offline;
        if (!src) {
          const res = await fetch(`/api/tracks/${current.id}/stream-url`);
          if (!res.ok) return;
          src = ((await res.json()) as { url: string }).url;
        }
        if (cancelled || !src) return;
        audio.src = src;
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

  // Seek bridge: the UI never touches the element — it posts a seek request and
  // PlayerRoot (the engine) applies it, then clears it (R4/P1).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !seekRequest) return;
    const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.max(0, Math.min(seekRequest.positionS, dur));
    usePlayer.getState().clearSeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.seq]);

  // Volume reconciliation (desktop slider).
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

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
    // ±15s + lock-screen scrubber (R4/P1) — hypno listeners re-hear passages.
    ms.setActionHandler("seekbackward", (d) => {
      const a = audioRef.current;
      if (!a) return;
      const off = d.seekOffset ?? 15;
      usePlayer.getState().seekTo(Math.max(0, a.currentTime - off));
    });
    ms.setActionHandler("seekforward", (d) => {
      const a = audioRef.current;
      if (!a) return;
      const off = d.seekOffset ?? 15;
      const dur = Number.isFinite(a.duration) ? a.duration : a.currentTime + off;
      usePlayer.getState().seekTo(Math.min(dur, a.currentTime + off));
    });
    ms.setActionHandler("seekto", (d) => {
      if (d.seekTime == null) return;
      if (d.fastSeek && audioRef.current?.fastSeek) {
        audioRef.current.fastSeek(d.seekTime);
        return;
      }
      usePlayer.getState().seekTo(d.seekTime);
    });
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("seekbackward", null);
      ms.setActionHandler("seekforward", null);
      ms.setActionHandler("seekto", null);
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

  function onProgress() {
    const audio = audioRef.current;
    if (!audio) return;
    usePlayer.getState().setBuffered(bufferedAheadOf(audio));
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    usePlayer.getState().setProgress(audio.currentTime, audio.duration || 0);
    usePlayer.getState().setBuffered(bufferedAheadOf(audio));

    // Keep the lock-screen scrubber in sync (best-effort).
    if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            position: Math.min(audio.currentTime, duration),
            playbackRate: audio.playbackRate || 1,
          });
        } catch {
          // some engines throw mid-load; ignore
        }
      }
    }

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
        onProgress={onProgress}
        onEnded={onEnded}
        preload="metadata"
      />
      {/* Chrome only on subject surfaces; the engine above always runs. */}
      {chromeless ? null : (
        <>
          <MiniBar />
          <Fullscreen />
          <QueueSheet />
          <Toaster />
          <DropPrompt />
          {/* R9.1: her live touch, fading over the player while a track plays. */}
          <Touch />
        </>
      )}
    </>
  );
}
