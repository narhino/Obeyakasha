import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chains, entitlements, users } from "@/lib/db/schema";
import { Badge, Card, PageHeading, Whisper } from "@/components/ui";

export default async function SanctumSubjects() {
  const rows = await db
    .select({
      id: users.id,
      name: users.chosenName,
      email: users.email,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      chain: chains.currentLen,
      // Their standing, so she can answer "why is mine sealed?" from the list
      // instead of opening each profile to find out.
      entitlementStatus: entitlements.status,
      level: entitlements.accessLevel,
    })
    .from(users)
    .leftJoin(chains, eq(chains.userId, users.id))
    .leftJoin(
      entitlements,
      and(eq(entitlements.userId, users.id), eq(entitlements.source, "patreon")),
    )
    .where(eq(users.role, "subject"))
    .orderBy(desc(users.createdAt))
    .limit(300);

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="People">Subjects</PageHeading>
      <Whisper className="mt-1">{rows.length} claimed.</Whisper>

      <div className="mt-6 space-y-2">
        {rows.map((s) => (
          <Link key={s.id} href={`/sanctum/subjects/${s.id}`}>
            <Card className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-text">
                  {s.name ?? s.email ?? s.id.slice(0, 8)}
                </p>
                <Whisper className="text-xs">
                  chain {s.chain ?? 0}d
                  {s.entitlementStatus === "frozen"
                    ? " · pledge stopped"
                    : s.entitlementStatus === "grace"
                      ? " · in grace"
                      : s.level
                        ? ` · level ${s.level}`
                        : ""}
                </Whisper>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.entitlementStatus === "frozen" ? (
                  <Badge tone="danger">frozen</Badge>
                ) : s.entitlementStatus === "grace" ? (
                  <Badge tone="gold">grace</Badge>
                ) : null}
                {s.status !== "active" ? (
                  <Badge tone="danger">{s.status}</Badge>
                ) : null}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
