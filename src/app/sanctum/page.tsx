import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  messages,
  reviewQueue,
  tierMappings,
  users,
  wishes,
} from "@/lib/db/schema";
import { Card, Display, Whisper } from "@/components/ui";

async function count(where: Promise<{ n: number }[]>): Promise<number> {
  return (await where)[0]?.n ?? 0;
}

export default async function SanctumToday() {
  const [subjects, mappings, unread, pendingReviews, newComms, newWishes] =
    await Promise.all([
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.role, "subject")),
      ),
      count(db.select({ n: sql<number>`count(*)::int` }).from(tierMappings)),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(messages)
          .where(and(eq(messages.sender, "subject"), isNull(messages.readAt))),
      ),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(reviewQueue)
          .where(eq(reviewQueue.status, "pending")),
      ),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(commissions)
          .where(eq(commissions.status, "new")),
      ),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(wishes)
          .where(eq(wishes.status, "new")),
      ),
    ]);

  const tiles = [
    { label: "Unread messages", value: unread, href: "/sanctum/messages" },
    { label: "Awaiting review", value: pendingReviews, href: "/sanctum/organize" },
    { label: "New commissions", value: newComms, href: "/sanctum/commissions" },
    { label: "New wishes", value: newWishes, href: "/sanctum/wishes" },
    { label: "Subjects", value: subjects, href: "/sanctum/subjects" },
    { label: "Tier mappings", value: mappings, href: "/sanctum/access" },
  ];

  return (
    <div>
      <Display className="text-3xl">Today</Display>
      <Whisper className="mt-1">Everything that wants you.</Whisper>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card raised>
              <Whisper>{t.label}</Whisper>
              <p className="mt-1 text-3xl font-[family-name:var(--font-display)]">
                {t.value}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
