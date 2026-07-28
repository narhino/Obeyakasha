"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectPlatform,
  fetchDeviceState,
  fetchVapidKey,
  getDeviceId,
  isStandalone,
  proveNotificationsWork,
  registerDevice,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/pwa/client";
import { Button, Card, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";

const DISMISSED_KEY = "akasha_desktop_invite_dismissed";

/**
 * The laptop's invitation to let her voice through — an offer, never a demand.
 *
 * On a phone the threshold is a wall, and it can be, because a phone that has
 * refused notifications can be walked into its settings and fixed. A desktop
 * browser that has already denied them cannot be re-prompted by script at all,
 * so walling desktop would lock someone out with no route back — which is why
 * `jail()` never holds a laptop for anything. This card is what replaces it: a
 * quiet ask that takes no for an answer.
 *
 * It shows only when there is something to ask for (push is supported, not
 * already proved working, she hasn't silenced the ask for this subject), and
 * "Not now" hides it on this machine for good. If they say yes, it proves
 * delivery the same way the phone does — a real notification, watched landing —
 * because "allowed" was never evidence of anything.
 */
export function DesktopInvite({ enabled }: { enabled: boolean }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if (localStorage.getItem(DISMISSED_KEY) === "1") return;
      if (detectPlatform() !== "desktop") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (!("Notification" in window)) return;
      // Nothing to offer if the browser has already refused: the prompt cannot
      // be raised again from script, and pretending otherwise wastes their time.
      if (Notification.permission === "denied") return;
      const vapid = await fetchVapidKey();
      if (!vapid || cancelled) return;
      // Already proved working on this machine → say nothing.
      const state = await fetchDeviceState(getDeviceId());
      if (cancelled || state?.verified) return;
      setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const accept = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const vapid = await fetchVapidKey();
      if (!vapid) return;
      await registerServiceWorker();
      const sub = await subscribeToPush(vapid);
      if (!sub) {
        setFailed(true);
        return;
      }
      await registerDevice({
        deviceId: getDeviceId(),
        platform: detectPlatform(),
        installed: isStandalone(),
        pushEnabled: true,
        pushSubscription: sub,
      });
      const proved = await proveNotificationsWork(getDeviceId());
      if (!proved) {
        setFailed(true);
        return;
      }
      setDone(true);
      setTimeout(() => setShow(false), 2500);
    } finally {
      setBusy(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }, []);

  if (!show) return null;

  return (
    <Card raised className="mb-6 border-gold/30">
      {done ? (
        <Whisper className="text-sm text-gold">
          {copy.gate.desktop.proved}
        </Whisper>
      ) : (
        <>
          <p className="font-[family-name:var(--font-display)] text-lg text-text">
            {copy.gate.desktop.title}
          </p>
          <Whisper className="mt-1 text-sm leading-relaxed">
            {copy.gate.desktop.body}
          </Whisper>
          {failed ? (
            <Whisper className="mt-2 text-xs text-danger">
              {copy.gate.desktop.failed}
            </Whisper>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="gold" size="sm" onClick={accept} loading={busy}>
              {busy ? copy.gate.verify.proving : copy.gate.desktop.accept}
            </Button>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs tracking-[0.04em] text-text-dim/70 transition-colors hover:text-text-dim"
            >
              {copy.gate.desktop.decline}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
