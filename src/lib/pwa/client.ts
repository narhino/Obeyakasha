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

export async function registerDevice(payload: {
  deviceId: string;
  platform: Platform;
  installed: boolean;
  pushEnabled: boolean;
  pushSubscription: PushSubscriptionJSON | null;
}): Promise<void> {
  await fetch("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, ua: navigator.userAgent }),
  });
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
