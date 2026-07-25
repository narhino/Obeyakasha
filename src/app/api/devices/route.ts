import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { devices } from "@/lib/db/schema";

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
    await db
      .insert(devices)
      .values({
        id: d.deviceId,
        userId,
        platform: d.platform,
        installed: d.installed ?? false,
        pushEnabled: d.pushEnabled ?? false,
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
        set: {
          userId,
          platform: d.platform,
          installed: d.installed ?? false,
          pushEnabled: d.pushEnabled ?? false,
          pushSubscription: d.pushSubscription ?? null,
          ua: d.ua,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
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
      })
      .from(devices)
      // Scoped to the caller: another subject's device must not be readable —
      // not its state, not even the fact that it exists (D7).
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1);
    return { device: row ?? null, userId: userId ? true : false };
  });
}
