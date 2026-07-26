import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageViews } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";

/**
 * Traffic rows do not live forever (A21). The worker calls this daily; anything
 * older than the `analytics_retention_days` setting (400 by default — a little
 * over a year, so a year-on-year comparison is still possible) is deleted.
 *
 * The window is a setting rather than a literal so she can shorten it without a
 * deploy; the floor of 1 day exists so a bad value cannot mean "keep forever".
 * The delete runs entirely in SQL (indexed on created_at) and never returns the
 * rows — a first run after a long gap must not pull a year of ids into memory.
 */
export async function pruneOldPageViews(): Promise<number> {
  const days = Math.max(
    1,
    Math.round(await getSetting("analytics_retention_days")),
  );
  const res = await db.execute(
    sql`DELETE FROM ${pageViews} WHERE ${pageViews.createdAt} < now() - make_interval(days => ${days})`,
  );
  return (res as unknown as { count?: number }).count ?? 0;
}
