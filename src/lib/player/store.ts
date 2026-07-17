"use client";

import { create } from "zustand";

/**
 * Player state (PLAN §9, R4/P1). A single <audio> element (mounted once at app
 * root) is driven by this store. UI components subscribe; they NEVER touch the
 * audio element directly — seeking is bridged through `seekRequest`, which
 * PlayerRoot (the engine) consumes.
 *
 * Spotify-grade queue model: the "up next" is split into two lists.
 *  - `manualQueue` — tracks the subject explicitly queued. These ALWAYS play
 *    first, in order, and are consumed (removed) as they become current.
 *  - `sourceQueue` + `sourceName` — the series / shelf / album they started.
 *    `sourceIndex` points at the current source item (or the last-played one
 *    while a manual item is interposed), so the source resumes correctly.
 */
export type EndMode =
  | "continue"
  | "stop"
  | "repeatTrack"
  | "repeatPlaylist"
  | "sleep";

export interface QueueTrack {
  id: string;
  title: string;
  durationS: number | null;
  artworkKey: string | null;
}

/** Which of the two queues a row belongs to. */
export type QueueKind = "manual" | "source";

/** A pending seek the UI requested; PlayerRoot applies it to the element. */
export interface SeekRequest {
  positionS: number;
  seq: number;
}

interface PlayerState {
  manualQueue: QueueTrack[];
  sourceQueue: QueueTrack[];
  sourceName: string | null;
  sourceIndex: number;
  current: QueueTrack | null;
  playing: boolean;
  positionS: number;
  durationS: number;
  /** Seconds buffered ahead of the playhead (for the scrub bar indicator). */
  bufferedS: number;
  volume: number;
  endMode: EndMode;
  sleepTimerMin: number | null;
  fullscreen: boolean;
  queueOpen: boolean;
  grounding: boolean;
  seekRequest: SeekRequest | null;

  // playback entry points
  playSource: (tracks: QueueTrack[], name: string | null, startIndex?: number) => void;
  playNow: (tracks: QueueTrack[], startIndex?: number) => void;
  addToQueue: (t: QueueTrack) => void;
  playNext: (t: QueueTrack) => void;

  // queue editing
  removeFromQueue: (id: string, which: QueueKind) => void;
  reorderManual: (from: number, to: number) => void;
  jumpTo: (id: string) => void;
  clearManual: () => void;

  // transport
  next: () => void;
  prev: () => void;
  toggle: () => void;
  setPlaying: (p: boolean) => void;
  seekTo: (positionS: number) => void;
  clearSeek: () => void;

  // modes + chrome
  setEndMode: (m: EndMode) => void;
  setSleepTimer: (min: number | null) => void;
  setFullscreen: (v: boolean) => void;
  setQueueOpen: (v: boolean) => void;
  setVolume: (v: number) => void;
  setProgress: (positionS: number, durationS: number) => void;
  setBuffered: (bufferedS: number) => void;

  // lifecycle
  onTrackEnded: () => void;
  beginGrounding: () => void;
  endGrounding: () => void;
}

function bumpSeek(prev: SeekRequest | null, positionS: number): SeekRequest {
  return { positionS, seq: (prev?.seq ?? 0) + 1 };
}

export const usePlayer = create<PlayerState>((set, get) => ({
  manualQueue: [],
  sourceQueue: [],
  sourceName: null,
  sourceIndex: 0,
  current: null,
  playing: false,
  positionS: 0,
  durationS: 0,
  bufferedS: 0,
  volume: 1,
  endMode: "continue",
  sleepTimerMin: null,
  fullscreen: false,
  queueOpen: false,
  grounding: false,
  seekRequest: null,

  playSource: (tracks, name, startIndex = 0) => {
    if (tracks.length === 0) return;
    const idx = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    set({
      sourceQueue: tracks,
      sourceName: name,
      sourceIndex: idx,
      manualQueue: [],
      current: tracks[idx] ?? null,
      playing: true,
      positionS: 0,
      bufferedS: 0,
    });
  },

  // Backwards-compatible: play a loose list as an unnamed source.
  playNow: (tracks, startIndex = 0) => get().playSource(tracks, null, startIndex),

  addToQueue: (t) =>
    set((s) => {
      if (!s.current) {
        // Nothing loaded — start it now (keeps the old "first add plays" feel).
        return {
          sourceQueue: [t],
          sourceIndex: 0,
          current: t,
          playing: true,
          positionS: 0,
          bufferedS: 0,
        };
      }
      return { manualQueue: [...s.manualQueue, t] };
    }),

  playNext: (t) =>
    set((s) => {
      if (!s.current) {
        return {
          sourceQueue: [t],
          sourceIndex: 0,
          current: t,
          playing: true,
          positionS: 0,
          bufferedS: 0,
        };
      }
      return { manualQueue: [t, ...s.manualQueue] };
    }),

  removeFromQueue: (id, which) =>
    set((s) => {
      if (which === "manual") {
        return { manualQueue: s.manualQueue.filter((t) => t.id !== id) };
      }
      const idx = s.sourceQueue.findIndex((t) => t.id === id);
      // Never remove the track that is currently playing from the source list.
      if (idx < 0 || idx === s.sourceIndex) return s;
      const sourceQueue = s.sourceQueue.filter((_, i) => i !== idx);
      const sourceIndex = idx < s.sourceIndex ? s.sourceIndex - 1 : s.sourceIndex;
      return { sourceQueue, sourceIndex };
    }),

  reorderManual: (from, to) =>
    set((s) => {
      const q = [...s.manualQueue];
      if (from < 0 || from >= q.length || to < 0 || to >= q.length) return s;
      const [moved] = q.splice(from, 1);
      if (!moved) return s;
      q.splice(to, 0, moved);
      return { manualQueue: q };
    }),

  jumpTo: (id) => {
    const s = get();
    const mIdx = s.manualQueue.findIndex((t) => t.id === id);
    if (mIdx >= 0) {
      // Tapping ahead in the manual queue consumes the items above it (Spotify).
      set({
        current: s.manualQueue[mIdx] ?? null,
        manualQueue: s.manualQueue.slice(mIdx + 1),
        positionS: 0,
        playing: true,
      });
      return;
    }
    const sIdx = s.sourceQueue.findIndex((t) => t.id === id);
    if (sIdx >= 0) {
      set({
        sourceIndex: sIdx,
        current: s.sourceQueue[sIdx] ?? null,
        positionS: 0,
        playing: true,
      });
    }
  },

  clearManual: () => set({ manualQueue: [] }),

  next: () => {
    const s = get();
    if (s.manualQueue.length > 0) {
      const [head, ...rest] = s.manualQueue;
      set({ manualQueue: rest, current: head, positionS: 0, playing: true });
      return;
    }
    if (s.sourceIndex < s.sourceQueue.length - 1) {
      const sourceIndex = s.sourceIndex + 1;
      set({
        sourceIndex,
        current: s.sourceQueue[sourceIndex] ?? null,
        positionS: 0,
        playing: true,
      });
      return;
    }
    if (s.endMode === "repeatPlaylist" && s.sourceQueue.length > 0) {
      set({ sourceIndex: 0, current: s.sourceQueue[0] ?? null, positionS: 0, playing: true });
      return;
    }
    set({ playing: false });
  },

  prev: () => {
    const s = get();
    // Restart if >3s in, or already at the head of the source.
    if (s.positionS > 3 || s.sourceIndex <= 0) {
      set({ positionS: 0, seekRequest: bumpSeek(s.seekRequest, 0) });
      return;
    }
    const sourceIndex = s.sourceIndex - 1;
    set({
      sourceIndex,
      current: s.sourceQueue[sourceIndex] ?? null,
      positionS: 0,
      playing: true,
    });
  },

  toggle: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),

  seekTo: (positionS) =>
    set((s) => ({
      positionS,
      seekRequest: bumpSeek(s.seekRequest, positionS),
    })),
  clearSeek: () => set({ seekRequest: null }),

  setEndMode: (m) => set({ endMode: m }),
  setSleepTimer: (min) => set({ sleepTimerMin: min }),
  setFullscreen: (v) => set({ fullscreen: v }),
  setQueueOpen: (v) => set({ queueOpen: v }),
  setVolume: (v) => set({ volume: Math.min(Math.max(v, 0), 1) }),
  setProgress: (positionS, durationS) => set({ positionS, durationS }),
  setBuffered: (bufferedS) => set({ bufferedS }),

  onTrackEnded: () => {
    const s = get();
    if (s.endMode === "repeatTrack") {
      set({ positionS: 0, playing: true });
      return;
    }
    if (s.endMode === "stop") {
      set({ playing: false, positionS: 0 });
      return;
    }
    // continue | repeatPlaylist | sleep → advance (manual first, then source).
    get().next();
  },

  beginGrounding: () => set({ grounding: true, playing: false }),
  endGrounding: () =>
    set({
      grounding: false,
      manualQueue: [],
      sourceQueue: [],
      sourceName: null,
      sourceIndex: 0,
      current: null,
      positionS: 0,
      bufferedS: 0,
      queueOpen: false,
    }),
}));
