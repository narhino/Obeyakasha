import { withSubject } from "@/lib/api";
import { selfHealNow } from "@/lib/patreon/selfheal";

/**
 * "I've upgraded — check again." A member's own button.
 *
 * The point is that nobody should have to write to her and wait to get back
 * what they already paid for. This re-reads Patreon with their own token, right
 * now, and answers with what it found.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return withSubject(async (userId) => {
    const result = await selfHealNow(userId);
    return {
      checked: result.checked,
      frozen: result.frozen,
      restored: result.restored,
    };
  });
}
