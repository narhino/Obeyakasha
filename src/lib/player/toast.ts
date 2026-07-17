"use client";

import { create } from "zustand";

/**
 * Tiny transient toast store (R4). Used for "Queued: <title>" acknowledgements
 * so adding to the queue never feels like a dead click. The <Toaster> in
 * PlayerRoot renders and auto-dismisses these; copy is always in Akasha's voice.
 */
export interface Toast {
  id: number;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text) =>
    set((s) => {
      const id = ++seq;
      // Keep at most three on screen; newest last.
      const toasts = [...s.toasts, { id, text }].slice(-3);
      return { toasts };
    }),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (imperative — safe outside React). */
export function toast(text: string): void {
  useToasts.getState().push(text);
}
