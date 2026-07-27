import webpush from "web-push";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { disguisePayload } from "./disguise";

/**
 * Server-side Web Push (PLAN §12). VAPID keys come from env; if they're not
 * configured, sends are skipped (the app still runs — push just does nothing
 * until keys are set). Dead subscriptions (404/410) are pruned automatically.
 */
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || "mailto:admin@example.com",
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  /** Notification icon; the service worker falls back to the brand icon if unset. */
  icon?: string;
  deepLink?: string;
  tag?: string;
  id?: string;
  /**
   * Only ever set on a proving push (src/lib/push/verify.ts). The service
   * worker echoes it back, which is how a device is proved reachable. It
   * survives the Secret-mode rewrite untouched — disguisePayload replaces only
   * title/body/icon — so proof works identically for a disguised subject.
   */
  verifyToken?: string;
}

export interface DeviceTarget {
  deviceId: string;
  /** Recipient of this device — used to key Secret mode. */
  userId: string;
  /**
   * Whether this recipient has Secret mode on. Required (not optional) on
   * purpose: every DeviceTarget is built in `targetsForUsers`, and making the
   * field mandatory means the type system forces the disguise decision to be
   * resolved for each target before it can reach `sendToDevice`.
   */
  disguise: boolean;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

export type SendResult = "sent" | "failed" | "pruned" | "skipped";

/**
 * THE SINGLE PUSH SEND CHOKE POINT. Every notification the platform delivers
 * passes through here — it is the only place `webpush.sendNotification` is
 * called (broadcast → sendToDevice). So Secret mode is enforced here, once:
 * when the recipient has `disguise` on, the payload's title/body/icon are
 * rewritten to an innocuous family-safe message (deep link + tag preserved)
 * before it ever leaves the server. Nothing can bypass this and still send.
 */
export async function sendToDevice(
  target: DeviceTarget,
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) return "skipped";
  const wirePayload = target.disguise ? disguisePayload(payload) : payload;
  try {
    await webpush.sendNotification(
      target.subscription,
      JSON.stringify(wirePayload),
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      // Subscription expired/unsubscribed — clear it so we stop trying.
      await db
        .update(devices)
        .set({ pushSubscription: null, pushEnabled: false })
        .where(eq(devices.id, target.deviceId));
      return "pruned";
    }
    return "failed";
  }
}

/** Load all push-enabled device targets for a set of user ids. */
export async function targetsForUsers(
  userIds: string[],
): Promise<Map<string, DeviceTarget[]>> {
  const byUser = new Map<string, DeviceTarget[]>();
  if (userIds.length === 0) return byUser;
  // Which of these recipients have Secret mode on — resolved once, batched,
  // and stamped onto every target so the choke point can enforce it.
  const disguisedRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, userIds), eq(users.disguiseMode, true)));
  const disguised = new Set(disguisedRows.map((r) => r.id));

  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.pushEnabled, true), isNotNull(devices.pushSubscription)));
  for (const d of rows) {
    if (!userIds.includes(d.userId) || !d.pushSubscription) continue;
    const list = byUser.get(d.userId) ?? [];
    list.push({
      deviceId: d.id,
      userId: d.userId,
      disguise: disguised.has(d.userId),
      subscription: d.pushSubscription,
    });
    byUser.set(d.userId, list);
  }
  return byUser;
}

export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}
