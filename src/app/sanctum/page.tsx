import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tierMappings, auditLog } from "@/lib/db/schema";
import { Card, Display, Whisper } from "@/components/ui";
import Link from "next/link";

export default async function SanctumToday() {
  const [[subjectsRow], [mappingsRow], [auditsRow]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(tierMappings),
    db.select({ n: sql<number>`count(*)::int` }).from(auditLog),
  ]);
  const subjects = subjectsRow?.n ?? 0;
  const mappings = mappingsRow?.n ?? 0;
  const audits = auditsRow?.n ?? 0;

  return (
    <div>
      <Display className="text-3xl">Today</Display>
      <Whisper className="mt-1">Everything at a glance.</Whisper>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card raised>
          <Whisper>Subjects</Whisper>
          <p className="mt-1 text-3xl font-[family-name:var(--font-display)]">
            {subjects}
          </p>
        </Card>
        <Card raised>
          <Whisper>Tier mappings</Whisper>
          <p className="mt-1 text-3xl font-[family-name:var(--font-display)]">
            {mappings}
          </p>
          {mappings === 0 ? (
            <Link
              href="/sanctum/access"
              className="mt-2 inline-block text-sm text-gold underline"
            >
              Map your Patreon tiers →
            </Link>
          ) : null}
        </Card>
        <Card raised>
          <Whisper>Audit entries</Whisper>
          <p className="mt-1 text-3xl font-[family-name:var(--font-display)]">
            {audits}
          </p>
        </Card>
      </div>

      <Whisper className="mt-10 max-w-lg">
        This is milestone M0 — foundations. The library, player, notifications,
        and relationship tools arrive in the milestones that follow (see
        docs/PLAN.md §23).
      </Whisper>
    </div>
  );
}
