import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Integration-test helpers. These run against the TEST database configured in
 * vitest.config.ts (obeyakasha_test) — never the app database.
 */
const TABLES = [
  "audit_log",
  "entitlements",
  "grants",
  "patreon_links",
  "tier_mappings",
  "settings",
  "consents",
  "devices",
  "accounts",
  "sessions",
  "users",
];

export async function truncateAll() {
  await db.execute(
    sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`),
  );
}
