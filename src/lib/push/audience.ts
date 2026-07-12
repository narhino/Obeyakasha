import { and, eq, gte, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, users } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";

/**
 * Resolve an audience selector to a concrete set of subject user ids
 * (PLAN §12). Supported now: all · level (at or above) · users. `segment`
 * dynamic rules are a follow-up (evaluated by the worker) and resolve to empty.
 */
export async function expandAudience(audience: Audience): Promise<string[]> {
  switch (audience.type) {
    case "all": {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "subject"), eq(users.status, "active")));
      return rows.map((r) => r.id);
    }
    case "level": {
      const rows = await db
        .selectDistinct({ id: users.id })
        .from(users)
        .innerJoin(entitlements, eq(entitlements.userId, users.id))
        .where(
          and(
            eq(users.status, "active"),
            gte(entitlements.accessLevel, audience.level),
            or(
              eq(entitlements.status, "active"),
              eq(entitlements.status, "grace"),
            ),
          ),
        );
      return rows.map((r) => r.id);
    }
    case "users": {
      if (audience.userIds.length === 0) return [];
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, audience.userIds));
      return rows.map((r) => r.id);
    }
    case "segment":
    default:
      return [];
  }
}
