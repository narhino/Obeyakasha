"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * The whole client half of first-party analytics (A21): one fetch per route
 * change, and one beacon carrying how long that view was actually looked at.
 * Mounted once in the root layout. Renders nothing, blocks nothing, and never
 * shows the visitor anything — a failed measurement is silently dropped.
 *
 * WHAT IT SENDS: the pathname (normalized to a route pattern on the server
 * before it is stored) and, on the first view of a real page load only, the
 * referring HOST. Nothing else. No fingerprinting, no ids of any kind, no
 * third-party request — the CSP would refuse one anyway.
 *
 * DO NOT TRACK is honoured here, at the source: when the browser asks not to be
 * counted, nothing is sent at all, so no row exists to delete later.
 *
 * DWELL: we accumulate *visible* milliseconds and re-send the running total on
 * every hide / unload / route change. The server folds it in with GREATEST, so
 * tabbing away and coming back refines the number upward instead of freezing it
 * at the first hide.
 */

/** The browser asked not to be counted — in any of the three ways it can ask. */
function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return (
    nav.doNotTrack === "1" ||
    nav.msDoNotTrack === "1" ||
    win.doNotTrack === "1"
  );
}

/** Best-effort POST. sendBeacon survives an unload; fetch/keepalive is the fallback. */
function send(payload: unknown, preferBeacon: boolean): void {
  const body = JSON.stringify(payload);
  if (preferBeacon && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    } catch {
      // fall through to fetch
    }
  }
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function PageViews({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname();
  /** Row id of the view currently open, from the server's reply. */
  const viewId = useRef<string | null>(null);
  /** Visible ms banked from earlier visible stretches of this same view. */
  const banked = useRef(0);
  /** When the current visible stretch began, or null while hidden. */
  const shownAt = useRef<number | null>(null);
  /** Referrer is sent once per document, not once per client-side navigation. */
  const referrerSent = useRef(false);

  useEffect(() => {
    if (!enabled || optedOut()) return;

    // ── flush the dwell of whatever view is open ──────────────────────────
    const flush = (beacon: boolean) => {
      if (shownAt.current != null) {
        banked.current += Date.now() - shownAt.current;
        shownAt.current = null;
      }
      const id = viewId.current;
      if (!id || banked.current <= 0) return;
      send({ viewId: id, dwellMs: Math.round(banked.current) }, beacon);
    };

    // ── open this view ────────────────────────────────────────────────────
    let live = true;
    banked.current = 0;
    shownAt.current = document.visibilityState === "hidden" ? null : Date.now();
    viewId.current = null;

    let referrer: string | undefined;
    if (!referrerSent.current) {
      referrerSent.current = true;
      try {
        const r = document.referrer;
        if (r) {
          const host = new URL(r).hostname;
          // Only somewhere else. An internal referrer is our own navigation.
          if (host && host !== window.location.hostname) referrer = host;
        }
      } catch {
        // no usable referrer
      }
    }

    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { viewId?: string } | null) => {
        if (live && d?.viewId) viewId.current = d.viewId;
      })
      .catch(() => {});

    // ── dwell bookkeeping ─────────────────────────────────────────────────
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
      else if (shownAt.current == null) shownAt.current = Date.now();
    };
    const onPageHide = () => flush(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      // Leaving for another route: bank the last stretch and report it.
      flush(true);
    };
  }, [pathname, enabled]);

  return null;
}
