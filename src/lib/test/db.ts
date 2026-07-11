import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Integration-test helpers. These run against the TEST database configured in
 * vitest.config.ts (obeyakasha_test) — never the app database.
 *
 * truncateAll wipes every table (except the drizzle migrations bookkeeping) so
 * tests are isolated regardless of which tables a given test touches.
 */
export async function truncateAll() {
  const rows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE '\\_\\_drizzle%'`,
  );
  const tables = (rows as unknown as { tablename: string }[]).map(
    (r) => `"${r.tablename}"`,
  );
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE;`),
  );
}
