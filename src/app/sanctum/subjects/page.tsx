import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chains, users } from "@/lib/db/schema";
import { Badge, Card, Display, Whisper } from "@/components/ui";

export default async function SanctumSubjects() {
  const rows = await db
    .select({
      id: users.id,
      name: users.chosenName,
      email: users.email,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      chain: chains.currentLen,
    })
    .from(users)
    .leftJoin(chains, eq(chains.userId, users.id))
    .where(eq(users.role, "subject"))
    .orderBy(desc(users.createdAt))
    .limit(300);

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Subjects</Display>
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
                </Whisper>
              </div>
              {s.status !== "active" ? (
                <Badge tone="danger">{s.status}</Badge>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
