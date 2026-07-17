import { and, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { entitlements, users } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";

/**
 * Pure: does a given subject fall inside an audience? `isCollared` answers the
 * `oath` audience (R9.5) — the collared inner circle — and defaults to false, so
 * a surface that never targets the oath (polls, questions) needs no change and
 * fails closed.
 */
export function audienceMatches(
  audience: Audience,
  userLevel: number,
  userId: string,
  isCollared = false,
): boolean {
  switch (audience.type) {
    case "public":
      // Visible to everyone, logged-out visitors included; a signed-in
      // subject sees it too.
      return true;
    case "all":
      return true;
    case "level":
      return userLevel >= audience.level;
    case "oath":
      return isCollared;
    case "users":
      return audience.userIds.includes(userId);
    default:
      return false;
  }
}

/**
 * Resolve an audience selector to a concrete set of subject user ids
 * (PLAN §12). Supported now: all · level (at or above) · users. `segment`
 * dynamic rules are a follow-up (evaluated by the worker) and resolve to empty.
 */
export async function expandAudience(audience: Audience): Promise<string[]> {
  switch (audience.type) {
    // `public` is the most permissive audience: for push it reaches every
    // active subject, exactly like `all`. Its only difference from `all` is
    // that logged-out visitors may also read it in the feed.
    case "public":
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
    // The collared inner circle (R9.5): active subjects with oathAt set.
    case "oath": {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.role, "subject"),
            eq(users.status, "active"),
            isNotNull(users.oathAt),
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
