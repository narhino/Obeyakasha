import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { consents } from "@/lib/db/schema";

/** True once the subject has given the required age + hypnosis-terms consents. */
export async function hasCoreConsent(userId: string): Promise<boolean> {
  const rows = await db
    .select({ kind: consents.kind })
    .from(consents)
    .where(
      and(
        eq(consents.userId, userId),
        inArray(consents.kind, ["age", "hypnosis_terms"]),
      ),
    );
  const kinds = new Set(rows.map((r) => r.kind));
  return kinds.has("age") && kinds.has("hypnosis_terms");
}
