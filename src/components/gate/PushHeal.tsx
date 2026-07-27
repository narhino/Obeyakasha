"use client";

import { useEffect } from "react";
import {
  detectPlatform,
  getDeviceId,
  isStandalone,
  registerDevice,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/pwa/client";

const LAST_ENDPOINT_KEY = "akasha_push_endpoint";

/**
 * Silent repair for push that is "allowed" but not actually wired.
 *
 * Browser permission and a live push subscription are two different things,
 * and the threshold only checks the permission. Anyone who allowed
 * notifications while the server had no VAPID keys — or whose subscription the
 * browser later rotated or dropped — is left permanently unreachable: granted,
 * so never asked again, yet subscribed to nothing.
 *
 * On load, when permission is ALREADY granted (so nothing is prompted and no
 * dialog can appear), this re-subscribes if needed and re-registers the device
 * whenever its endpoint changed. Entirely best-effort: any failure is silence,
 * never an error in her subject's face.
 */
export function PushHeal() {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (
          !("serviceWorker" in navigator) ||
          !("PushManager" in window) ||
          !("Notification" in window) ||
          Notification.permission !== "granted"
        ) {
          return;
        }

        const reg =
          (await navigator.serviceWorker.getRegistration()) ??
          (await registerServiceWorker());
        if (!reg || cancelled) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const res = await fetch("/api/push/vapid-key", { cache: "no-store" });
          const { key } = (await res.json()) as { key: string | null };
          if (!key || cancelled) return;
          sub = (await subscribeToPush(key)) as PushSubscription | null;
          if (!sub) return;
        }

        // Only write when something actually changed — this runs on every load.
        const json = sub.toJSON();
        const endpoint = json.endpoint;
        // The app's own subscription shape requires an endpoint and both
        // encryption keys; anything less can't be delivered to, so leave the
        // device exactly as it was rather than storing a broken record.
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;
        if (!endpoint || !p256dh || !auth) return;
        if (localStorage.getItem(LAST_ENDPOINT_KEY) === endpoint) return;

        await registerDevice({
          deviceId: getDeviceId(),
          platform: detectPlatform(),
          installed: isStandalone(),
          pushEnabled: true,
          pushSubscription: { endpoint, keys: { p256dh, auth } },
        });
        localStorage.setItem(LAST_ENDPOINT_KEY, endpoint);
      } catch {
        /* best-effort: a device that can't heal simply stays as it was */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
