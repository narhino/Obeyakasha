import { withSubject } from "@/lib/api";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { pickSurrender } from "@/lib/library/surrender";

/**
 * "She chooses" (R9.7). Returns 3–5 tracks the subject may play — unheard-first
 * from their top-listened tags, else the newest at their level — for the
 * Surrender band to drop straight into the player. Subject-gated; empty list
 * when nothing is eligible.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withSubject(async (userId) => {
    const access = await resolveAccess(userId);
    const tracks = await pickSurrender(userId, access.accessLevel);
    return { tracks };
  });
}
