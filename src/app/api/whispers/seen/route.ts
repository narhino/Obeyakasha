import { eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Mark the Whispers feed seen (F5). Called when the subject opens `/` — stamps
 * `lastSeenWhispersAt = now`, which clears the Whispers tab's red burn. Cheap,
 * idempotent, subject-only.
 */
export async function POST() {
  return withSubject(async (userId) => {
    await db
      .update(users)
      .set({ lastSeenWhispersAt: new Date() })
      .where(eq(users.id, userId));
    return { ok: true };
  });
}
