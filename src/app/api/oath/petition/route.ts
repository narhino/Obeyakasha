import { withSubject } from "@/lib/api";
import { petitionOath } from "@/lib/oath/ops";

/**
 * The collar petition (R9.5). A streak-eligible subject offers themselves; the
 * server re-checks eligibility, stamps oathPetitionedAt (idempotently), and
 * notifies her. Eligibility failures return `{ petitioned: false }` rather than
 * an error, so a stale client just learns nothing changed.
 */
export async function POST() {
  return withSubject(async (userId) => {
    return petitionOath(userId);
  });
}
