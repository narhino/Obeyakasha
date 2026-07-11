"use client";

import { create } from "zustand";

/**
 * Player state (PLAN §9). A single <audio> element (mounted once at app root)
 * is driven by this store. UI components subscribe; they never touch the audio
 * element directly except through these actions.
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

interface PlayerState {
  queue: QueueTrack[];
  index: number;
  current: QueueTrack | null;
  playing: boolean;
  positionS: number;
  durationS: number;
  endMode: EndMode;
  sleepTimerMin: number | null;
  fullscreen: boolean;
  grounding: boolean;

  // actions
  playNow: (tracks: QueueTrack[], startIndex?: number) => void;
  addToQueue: (t: QueueTrack) => void;
  playNext: (t: QueueTrack) => void;
  removeFromQueue: (index: number) => void;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  setPlaying: (p: boolean) => void;
  setEndMode: (m: EndMode) => void;
  setSleepTimer: (min: number | null) => void;
  setFullscreen: (v: boolean) => void;
  setProgress: (positionS: number, durationS: number) => void;
  onTrackEnded: () => void;
  beginGrounding: () => void;
  endGrounding: () => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  current: null,
  playing: false,
  positionS: 0,
  durationS: 0,
  endMode: "continue",
  sleepTimerMin: null,
  fullscreen: false,
  grounding: false,

  playNow: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    set({
      queue: tracks,
      index,
      current: tracks[index] ?? null,
      playing: true,
      positionS: 0,
    });
  },

  addToQueue: (t) =>
    set((s) => {
      const queue = [...s.queue, t];
      // If nothing is loaded, start playing it.
      if (!s.current) {
        return { queue, index: 0, current: t, playing: true };
      }
      return { queue };
    }),

  playNext: (t) =>
    set((s) => {
      const queue = [...s.queue];
      queue.splice(s.index + 1, 0, t);
      if (!s.current) return { queue, index: 0, current: t, playing: true };
      return { queue };
    }),

  removeFromQueue: (index) =>
    set((s) => {
      if (index === s.index) return s; // don't remove the playing track here
      const queue = s.queue.filter((_, i) => i !== index);
      const newIndex = index < s.index ? s.index - 1 : s.index;
      return { queue, index: newIndex };
    }),

  next: () => {
    const s = get();
    if (s.index < s.queue.length - 1) {
      const index = s.index + 1;
      set({ index, current: s.queue[index] ?? null, positionS: 0, playing: true });
    } else if (s.endMode === "repeatPlaylist" && s.queue.length > 0) {
      set({ index: 0, current: s.queue[0] ?? null, positionS: 0, playing: true });
    } else {
      set({ playing: false });
    }
  },

  prev: () => {
    const s = get();
    // Restart if >3s in, else go to previous track.
    if (s.positionS > 3 || s.index === 0) {
      set({ positionS: 0 });
      return;
    }
    const index = s.index - 1;
    set({ index, current: s.queue[index] ?? null, positionS: 0, playing: true });
  },

  toggle: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (p) => set({ playing: p }),
  setEndMode: (m) => set({ endMode: m }),
  setSleepTimer: (min) => set({ sleepTimerMin: min }),
  setFullscreen: (v) => set({ fullscreen: v }),
  setProgress: (positionS, durationS) => set({ positionS, durationS }),

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
    // continue | repeatPlaylist | sleep → advance
    get().next();
  },

  beginGrounding: () => set({ grounding: true, playing: false }),
  endGrounding: () =>
    set({ grounding: false, queue: [], current: null, index: 0, positionS: 0 }),
}));
