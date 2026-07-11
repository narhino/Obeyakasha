import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Health check (PLAN §20) for uptime monitoring + deploy readiness. Verifies
 * the DB is reachable. Returns 200 ok / 503 when the database is down.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, service: "web" });
  } catch {
    return Response.json({ ok: false, service: "web" }, { status: 503 });
  }
}
