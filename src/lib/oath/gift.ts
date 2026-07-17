import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { grants, tracks, users } from "@/lib/db/schema";
import { getRawSetting, setRawSetting } from "@/lib/settings";
import { broadcast } from "@/lib/push/broadcast";
import { logAudit } from "@/lib/audit";
import { copy } from "@/copy/copy";

/** Calendar-month stamp "YYYY-MM" used to run the gift at most once a month. */
export function monthStamp(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The collared's monthly gift (R9.5). Once a calendar month (fired by the daily
 * worker tick — so it lands on the 1st, or the first tick after), grant the
 * configured `oath_gift_track_id` to every collared subject who lacks it, then
 * push "A gift for the collared." to those who newly received it.
 *
 * Idempotent per month via the `oath_gift_last_granted` = "YYYY-MM" stamp: the
 * stamp is written only once the gift track is configured and the batch runs, so
 * if no track is set yet the tick simply waits and grants as soon as she sets one.
 * NEVER throws — the worker wraps it, but a gift failure must not wedge the loop.
 */
export async function grantMonthlyGift(now: Date = new Date()): Promise<void> {
  const stamp = monthStamp(now);
  const last = await getRawSetting<string | null>("oath_gift_last_granted", null);
  if (last === stamp) return; // already granted this month

  const trackId = await getRawSetting<string | null>("oath_gift_track_id", null);
  if (!trackId) return; // nothing configured yet — don't stamp, try again next tick

  // Confirm the gift track still exists before granting (a stale id → skip, no stamp).
  const [track] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!track) return;

  const collared = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "subject"),
        eq(users.status, "active"),
        isNotNull(users.oathAt),
      ),
    );
  const collaredIds = collared.map((c) => c.id);

  let lacking: string[] = [];
  if (collaredIds.length > 0) {
    const existing = await db
      .select({ userId: grants.userId })
      .from(grants)
      .where(and(inArray(grants.userId, collaredIds), eq(grants.trackId, trackId)));
    const has = new Set(existing.map((e) => e.userId));
    lacking = collaredIds.filter((id) => !has.has(id));

    if (lacking.length > 0) {
      await db.insert(grants).values(
        lacking.map((userId) => ({
          userId,
          trackId,
          note: `The collared — monthly gift ${stamp}`,
        })),
      );
      // A gift, not an appointment — respect quiet hours (kind automation, the
      // default respectQuietHours). The grant itself always lands; the push is
      // the flourish, and it never wakes anyone.
      await broadcast({
        title: copy.oath.giftPush.title,
        body: copy.oath.giftPush.body,
        deepLink: "/library",
        audience: { type: "users", userIds: lacking },
        kind: "automation",
      });
    }
  }

  await logAudit(null, "oath.monthly_gift", {
    trackId,
    month: stamp,
    granted: lacking.length,
  });
  // Claim the month last, so a mid-run failure retries next tick rather than skipping.
  await setRawSetting("oath_gift_last_granted", stamp);
}
