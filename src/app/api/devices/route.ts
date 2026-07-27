import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";
import { reverifySince } from "@/lib/push/verify";

const schema = z.object({
  deviceId: z.string().uuid(),
  platform: z.enum(["ios", "android", "desktop"]),
  installed: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  pushSubscription: z
    .object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    })
    .nullable()
    .optional(),
  /**
   * The ONLY way to erase a stored subscription. Absent or false means "leave
   * whatever is on file alone" — see the note on the upsert below for why that
   * distinction is the whole bug this route used to have.
   */
  clearPush: z.boolean().optional(),
  ua: z.string().max(500).optional(),
});

/** Register/update this device (install state + push subscription). PLAN §11-12. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const d = parsed.data;
  return withSubject(async (userId) => {
    /**
     * A registration only ever writes what it actually carries.
     *
     * This route used to set `pushSubscription: d.pushSubscription ?? null` on
     * every upsert. The gate calls this on EVERY mount without a subscription,
     * so a subject who enabled notifications had their live subscription
     * erased by their very next page load — and `targetsForUsers` requires a
     * non-null subscription, so from that moment on they received nothing, in
     * total silence. That is why no one was getting notifications.
     *
     * The rule now: a subscription is only ever written when one is supplied,
     * and only ever erased when the caller explicitly asks (`clearPush`) or
     * when the push service itself rejects it as gone (handled in
     * sendToDevice). Nothing incidental can take a device offline again.
     */
    const update: Record<string, unknown> = {
      userId,
      platform: d.platform,
      ua: d.ua,
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    };
    // `installed` may go either way — a subject really can remove the app.
    if (d.installed !== undefined) update.installed = d.installed;

    if (d.clearPush) {
      // Explicit teardown: they turned notifications off, so the proof of
      // delivery goes with the subscription.
      update.pushSubscription = null;
      update.pushEnabled = false;
      update.pushVerifiedAt = null;
      update.verifyToken = null;
    } else if (d.pushSubscription) {
      update.pushSubscription = d.pushSubscription;
      update.pushEnabled = d.pushEnabled ?? true;
    } else if (d.pushEnabled === false) {
      // The browser says permission is gone. Stop trying to send, but KEEP the
      // subscription: permission can be restored, and healing it back is then
      // silent instead of another trip through the gate.
      update.pushEnabled = false;
    }

    await db
      .insert(devices)
      .values({
        id: d.deviceId,
        userId,
        platform: d.platform,
        installed: d.installed ?? false,
        pushEnabled: d.pushSubscription ? (d.pushEnabled ?? true) : false,
        pushSubscription: d.pushSubscription ?? null,
        ua: d.ua,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: devices.id,
        // D7 — the deviceId is client-chosen, so an id that already belongs to
        // someone else must not be re-pointed (or its push subscription
        // rewritten) by this caller. The update simply does nothing then.
        setWhere: eq(devices.userId, userId),
        set: update,
      });
    return { ok: true };
  });
}

/** Current device's gate-relevant state (used to decide if the gate is satisfied). */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  return withSubject(async (userId) => {
    if (!deviceId) return { device: null };
    const [row] = await db
      .select({
        installed: devices.installed,
        pushEnabled: devices.pushEnabled,
        pushVerifiedAt: devices.pushVerifiedAt,
        hasSubscription: devices.pushSubscription,
      })
      .from(devices)
      // Scoped to the caller: another subject's device must not be readable —
      // not its state, not even the fact that it exists (D7).
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1);
    if (!row) return { device: null, userId: true };
    // `verified` is the gate's real question: has a push ever been PROVED to
    // land on this device since the last time she demanded proof?
    const since = await reverifySince();
    const verified =
      Boolean(row.pushVerifiedAt) &&
      (!since || (row.pushVerifiedAt as Date) >= since);
    return {
      device: {
        installed: row.installed,
        pushEnabled: row.pushEnabled,
        subscribed: Boolean(row.hasSubscription),
        verified,
        verifiedAt: row.pushVerifiedAt,
      },
      userId: true,
    };
  });
}
