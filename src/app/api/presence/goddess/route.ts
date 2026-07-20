import { eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { isGoddessOnline } from "@/lib/presence/core";

/**
 * "Is the Goddess on the app?" (F4) — for any signed-in subject. Returns a bare
 * boolean and NOTHING else: never a timestamp, never a count, never a word about
 * any other subject (D7). She reads online only within the presence window, with
 * presence enabled and the cloak down.
 */
export async function GET() {
  return withSubject(async () => {
    const [presenceEnabled, cloaked, goddess] = await Promise.all([
      getSetting("presence_enabled"),
      getSetting("goddess_cloak"),
      db
        .select({ lastSeenAt: users.lastSeenAt })
        .from(users)
        .where(eq(users.role, "goddess"))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);
    const online = isGoddessOnline(goddess?.lastSeenAt ?? null, {
      presenceEnabled,
      cloaked,
    });
    return { online };
  });
}
