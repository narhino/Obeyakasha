import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notificationDeliveries } from "@/lib/db/schema";

/**
 * The service worker's receipt line. "Sent" only ever meant the push service
 * accepted the message; this is where a device says the notification actually
 * arrived on screen ("delivered") and where it says the subject tapped it
 * ("opened"). Both are what the Sanctum reads back as real delivery detail.
 *
 * Called from sw.js on `push` and on `notificationclick`. Same-origin and
 * credentialed, so the session identifies the recipient — a caller can only
 * ever stamp their OWN delivery rows, never another subject's.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().uuid(),
  event: z.enum(["delivered", "opened"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  // No session → nothing to attribute. Not an error: a push can be drawn on a
  // device whose cookie has expired, and the SW shouldn't retry.
  if (!session?.user) return Response.json({ ok: true, recorded: false });

  let parsed;
  try {
    parsed = schema.safeParse(await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });

  const { id, event } = parsed.data;
  const mine = and(
    eq(notificationDeliveries.notificationId, id),
    eq(notificationDeliveries.userId, session.user.id),
  );

  if (event === "opened") {
    // Opening implies it was delivered — backfill both, and keep the FIRST tap
    // rather than overwriting it every time they come back to the same push.
    await db
      .update(notificationDeliveries)
      .set({ status: "clicked", openedAt: new Date() })
      .where(and(mine, isNull(notificationDeliveries.openedAt)));
    await db
      .update(notificationDeliveries)
      .set({ deliveredAt: new Date() })
      .where(and(mine, isNull(notificationDeliveries.deliveredAt)));
  } else {
    await db
      .update(notificationDeliveries)
      .set({ deliveredAt: new Date() })
      .where(and(mine, isNull(notificationDeliveries.deliveredAt)));
  }

  return Response.json({ ok: true, recorded: true });
}
