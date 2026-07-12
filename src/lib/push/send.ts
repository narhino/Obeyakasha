import webpush from "web-push";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";
import { env } from "@/lib/env";

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
  deepLink?: string;
  tag?: string;
  id?: string;
}

export interface DeviceTarget {
  deviceId: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
}

export type SendResult = "sent" | "failed" | "pruned" | "skipped";

/** Send one notification to one device; prunes the device if the sub is gone. */
export async function sendToDevice(
  target: DeviceTarget,
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) return "skipped";
  try {
    await webpush.sendNotification(
      target.subscription,
      JSON.stringify(payload),
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
  const rows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.pushEnabled, true), isNotNull(devices.pushSubscription)));
  for (const d of rows) {
    if (!userIds.includes(d.userId) || !d.pushSubscription) continue;
    const list = byUser.get(d.userId) ?? [];
    list.push({ deviceId: d.id, subscription: d.pushSubscription });
    byUser.set(d.userId, list);
  }
  return byUser;
}

export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}
