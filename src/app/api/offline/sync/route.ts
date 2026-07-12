import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { offlineGrants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getAccessibleTrack } from "@/lib/library/queries";

/**
 * Revalidate a subject's kept tracks (D4/§10.4). Returns the track ids they may
 * still keep; the client purges everything else. Frozen/lapsed → nothing valid.
 */
export async function POST() {
  return withSubject(async (userId) => {
    const access = await resolveAccess(userId);
    // Frozen accounts keep nothing offline.
    if (access.frozen) return { valid: [] as string[] };

    const grants = await db
      .select()
      .from(offlineGrants)
      .where(and(eq(offlineGrants.userId, userId), eq(offlineGrants.revoked, false)));

    const valid: string[] = [];
    for (const g of grants) {
      if (g.expiresAt && g.expiresAt.getTime() < Date.now()) continue;
      const track = await getAccessibleTrack(g.trackId, userId, access.accessLevel);
      if (track) valid.push(g.trackId);
    }
    return { valid };
  });
}
