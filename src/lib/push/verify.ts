import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { devices, users } from "@/lib/db/schema";
import { getRawSetting } from "@/lib/settings";
import { sendToDevice } from "./send";
import { copy } from "@/copy/copy";

/**
 * Proof of delivery, not permission.
 *
 * `Notification.permission === "granted"` has never meant a notification will
 * arrive. It survives a wiped subscription, a dead push endpoint, an OS-level
 * mute and a browser that quietly dropped the registration. Every one of those
 * looks identical to a working device from inside the page — which is exactly
 * how a whole membership ended up hearing nothing while the app believed they
 * were all reachable.
 *
 * So the gate stops trusting the browser. It asks the server to send ONE real
 * push, and the device is only counted as reachable once the service worker
 * echoes the token back from inside that push. Nothing else counts.
 */

/** Dynamic setting: devices verified before this must prove themselves again. */
const REVERIFY_KEY = "push_reverify_since";

/** The moment she last demanded fresh proof from everyone; null if never. */
export async function reverifySince(): Promise<Date | null> {
  const raw = await getRawSetting<string | null>(REVERIFY_KEY, null);
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether a device's proof still counts. */
export function isVerified(
  pushVerifiedAt: Date | null,
  since: Date | null,
): boolean {
  if (!pushVerifiedAt) return false;
  return !since || pushVerifiedAt >= since;
}

export type VerifyStart =
  | { ok: true }
  | { ok: false; reason: "no_device" | "no_subscription" | "push_off" | "send_failed" };

/**
 * Fire the proving push at one device. The token rides inside the payload; the
 * service worker POSTs it straight back to /api/push/verify, which is the only
 * thing that can stamp `pushVerifiedAt`.
 *
 * The notification it shows is a real one, in her voice — the subject sees the
 * thing working rather than a silent handshake they have to take on faith.
 * (It also HAS to be visible: `userVisibleOnly` subscriptions oblige the worker
 * to show something, and a browser that catches you not showing one starts
 * revoking the permission.)
 */
export async function startVerification(
  userId: string,
  deviceId: string,
): Promise<VerifyStart> {
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
    .limit(1);
  if (!device) return { ok: false, reason: "no_device" };
  if (!device.pushSubscription) return { ok: false, reason: "no_subscription" };
  if (!device.pushEnabled) return { ok: false, reason: "push_off" };

  const token = crypto.randomUUID();
  await db
    .update(devices)
    .set({ verifyToken: token, updatedAt: new Date() })
    .where(eq(devices.id, deviceId));

  // Straight through the one choke point, so Secret mode disguises this exactly
  // as it disguises everything else — the proving push must look like every
  // other push, or it proves the wrong thing. The disguise flag is resolved
  // here from the recipient rather than assumed: a subject in Secret mode must
  // not be handed an un-disguised notification just because it's a test.
  const [me] = await db
    .select({ disguise: users.disguiseMode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const result = await sendToDevice(
    {
      deviceId: device.id,
      userId,
      disguise: me?.disguise ?? false,
      subscription: device.pushSubscription,
    },
    {
      title: copy.gate.verify.pushTitle,
      body: copy.gate.verify.pushBody,
      deepLink: "/",
      tag: "akasha-verify",
      verifyToken: token,
    },
  );
  if (result !== "sent") return { ok: false, reason: "send_failed" };
  return { ok: true };
}

/** The service worker's echo — the single thing that can mark a device proved. */
export async function completeVerification(token: string): Promise<boolean> {
  const stamped = await db
    .update(devices)
    .set({
      pushVerifiedAt: new Date(),
      // Burn the token: it proves one delivery, once.
      verifyToken: null,
      pushEnabled: true,
      updatedAt: new Date(),
    })
    .where(eq(devices.verifyToken, token))
    .returning({ id: devices.id });
  return stamped.length > 0;
}
