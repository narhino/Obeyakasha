import { eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { shouldWriteHeartbeat } from "@/lib/presence/core";

/**
 * Presence heartbeat (F4). Any signed-in caller — subject OR goddess — refreshes
 * their own `lastSeenAt`. It is the goddess's beats that light the "She is here"
 * band for subjects; a subject's beats put them in her Sanctum "room" view.
 *
 * Throttled server-side: a beat lands from the client on load, on tab-focus, and
 * every 60s while visible, but we only write when the last stamp is older than
 * the throttle — so bursts (load + immediate focus) cost one write, not three.
 * Identity-only (acts on the session user); there is nothing to validate.
 */
export async function POST() {
  return withSubject(async (userId) => {
    const [me] = await db
      .select({ lastSeenAt: users.lastSeenAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const now = new Date();
    if (!shouldWriteHeartbeat(me?.lastSeenAt ?? null, now)) {
      return { ok: true, wrote: false };
    }
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
    return { ok: true, wrote: true };
  });
}
