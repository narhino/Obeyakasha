"use client";

/** Client PWA helpers (PLAN §11): device identity, platform detection, SW + push. */

export type Platform = "ios" | "android" | "desktop";

export function getDeviceId(): string {
  const KEY = "akasha_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent || "";
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as Mac; detect via touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

/** iOS major.minor (e.g. 16.4) or null. Web push needs iOS ≥ 16.4. */
export function iosVersion(): number | null {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent || "");
  if (!m) return null;
  return parseFloat(`${m[1]}.${m[2]}`);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari specific
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Request permission + subscribe. Returns the subscription or null if denied/unsupported. */
export async function subscribeToPush(
  vapidKey: string,
): Promise<PushSubscriptionJSON | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys) return null;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh!, auth: json.keys.auth! },
  };
}

export async function fetchVapidKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/vapid-key");
    const { key } = (await res.json()) as { key: string | null };
    return key;
  } catch {
    return null;
  }
}

/**
 * Register / touch this device.
 *
 * `pushSubscription` is OPTIONAL and omitting it means "leave whatever is on
 * file alone". It used to be a required `| null`, and every caller that had no
 * subscription to hand dutifully passed null — which the server wrote straight
 * over the live one. Erasing a subscription is now a deliberate act: pass
 * `clearPush: true`, and nothing else can do it by accident.
 */
export async function registerDevice(payload: {
  deviceId: string;
  platform: Platform;
  installed?: boolean;
  pushEnabled?: boolean;
  pushSubscription?: PushSubscriptionJSON;
  clearPush?: boolean;
}): Promise<void> {
  await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ua: navigator.userAgent }),
  });
}

export interface DeviceState {
  installed: boolean;
  pushEnabled: boolean;
  subscribed: boolean;
  /** A push has been PROVED to land here since she last demanded proof. */
  verified: boolean;
  verifiedAt: string | null;
}

/** This device's state as the server sees it — the gate's source of truth. */
export async function fetchDeviceState(
  deviceId: string,
): Promise<DeviceState | null> {
  try {
    const res = await fetch(
      `/api/devices?deviceId=${encodeURIComponent(deviceId)}`,
      { cache: "no-store" },
    );
    const { device } = (await res.json()) as { device: DeviceState | null };
    return device;
  } catch {
    return null;
  }
}

/**
 * Ask the server to prove this device receives pushes, then wait for the
 * service worker's echo. Resolves true only on real, observed delivery.
 *
 * Polls rather than listening for a message from the SW: the echo is an HTTP
 * call the SW makes on its own, and on iOS the page may not even be the one
 * that ends up handling the push event.
 */
export async function proveNotificationsWork(
  deviceId: string,
  timeoutMs = 20_000,
): Promise<boolean> {
  try {
    const res = await fetch("/api/push/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const started = (await res.json()) as { ok?: boolean };
    if (!started.ok) return false;
  } catch {
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const state = await fetchDeviceState(deviceId);
    if (state?.verified) return true;
  }
  return false;
}

export async function recordConsent(
  kind: "age" | "hypnosis_terms" | "privacy" | "theme_optout",
  payload?: Record<string, unknown>,
): Promise<void> {
  await fetch("/api/consents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
}
