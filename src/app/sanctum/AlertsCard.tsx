"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Whisper } from "@/components/ui";
import {
  detectPlatform,
  getDeviceId,
  isStandalone,
  registerDevice,
  registerServiceWorker,
  subscribeToPush,
  proveNotificationsWork,
} from "@/lib/pwa/client";
import { sendTestAlert } from "./actions";

type State =
  | "checking"
  | "unsupported" // no service worker / no Push API in this browser
  | "nokeys" // VAPID keys aren't configured on the server yet
  | "denied" // the browser blocked notifications for this site
  | "off" // supported, allowed to ask, not subscribed yet
  | "unproved" // subscribed, but the test notification never appeared
  | "on"; // PROVED — a real alert was sent and this device saw it land

/**
 * Her own alerts, from inside the Sanctum. The subject-facing Gate/threshold
 * never runs for the goddess, so without this there is no way for her to
 * subscribe her own device — every notifyGoddess call would push into nothing.
 *
 * Reuses the same subscribe + registerDevice path the Gate uses, so a device
 * registered here is identical to any other. Admin-facing strings are inline,
 * matching the rest of the Sanctum.
 */
export function AlertsCard() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const check = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }
    // No server keys → subscribing is impossible; say so instead of failing.
    try {
      const res = await fetch("/api/push/vapid-key", { cache: "no-store" });
      const { key } = (await res.json()) as { key: string | null };
      if (!key) {
        setState("nokeys");
        return;
      }
    } catch {
      setState("nokeys");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/vapid-key", { cache: "no-store" });
      const { key } = (await res.json()) as { key: string | null };
      if (!key) {
        setState("nokeys");
        return;
      }
      await registerServiceWorker();
      const sub = await subscribeToPush(key);
      if (!sub) {
        // Either she dismissed the prompt or the browser refused.
        setState(Notification.permission === "denied" ? "denied" : "off");
        return;
      }
      await registerDevice({
        deviceId: getDeviceId(),
        platform: detectPlatform(),
        installed: isStandalone(),
        pushEnabled: true,
        pushSubscription: sub,
      });
      // Same proof her subjects have to give: send one and wait to see it land.
      // "On" here should mean it works, not that a browser said yes.
      const proved = await proveNotificationsWork(getDeviceId());
      setState(proved ? "on" : "unproved");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setSent(false);
    try {
      await sendTestAlert();
      setSent(true);
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === "checking") return null;

  return (
    <Card className="mt-4">
      <Whisper className="mb-2">Your alerts</Whisper>

      {state === "unsupported" ? (
        <Whisper className="text-xs">
          This browser can&apos;t carry notifications. Open the Sanctum in
          Chrome, Edge, or Safari — or install it to your home screen.
        </Whisper>
      ) : null}

      {state === "nokeys" ? (
        <Whisper className="text-xs">
          Push keys aren&apos;t set on the server yet, so nothing can be
          delivered. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT
          to .env, then redeploy.
        </Whisper>
      ) : null}

      {state === "denied" ? (
        <Whisper className="text-xs">
          You blocked notifications for this site. Undo it in the browser&apos;s
          site settings (the padlock beside the address), then reload.
        </Whisper>
      ) : null}

      {state === "off" ? (
        <>
          <Whisper className="mb-3 text-xs">
            Be told the moment something needs you — a message, a petition, a
            commission, a proof waiting on your word.
          </Whisper>
          <Button size="sm" variant="gold" onClick={enable} loading={busy}>
            Let me be told
          </Button>
        </>
      ) : null}

      {/* Allowed, but the proving notification never appeared — the exact
          state that used to pass silently as "on" and reach nobody. */}
      {state === "unproved" ? (
        <>
          <Whisper className="mb-3 text-xs text-danger">
            You allowed it, but the test notification never arrived. Something
            on this device is swallowing them — check your system notification
            settings for this browser, and that Do Not Disturb or Focus
            isn&apos;t on. Then try again.
          </Whisper>
          <Button size="sm" variant="gold" onClick={enable} loading={busy}>
            Try again
          </Button>
        </>
      ) : null}

      {state === "on" ? (
        <>
          <Whisper className="mb-3 text-xs">
            Proved — one was sent and this device saw it land. Install the
            Sanctum to your home screen and alerts arrive even with the browser
            closed.
          </Whisper>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="ghost" onClick={test} loading={busy}>
              Send me a test
            </Button>
            {sent ? (
              <Whisper className="text-xs text-gold/80">
                Sent. It should arrive in a moment.
              </Whisper>
            ) : null}
          </div>
        </>
      ) : null}
    </Card>
  );
}
