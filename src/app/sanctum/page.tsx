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
import { Badge, Button, Card, Display, Whisper } from "@/components/ui";
import { liveListeners } from "@/lib/listen/live";
import { pendingPetitions } from "@/lib/oath/resolve";
import { formatWhen } from "@/lib/format/when";
import { LivePanel } from "./live/LivePanel";
import { acceptOathAction, declineOathAction } from "./subjects/actions";

// The live panel polls, so keep this surface dynamic (never statically cached).
export const dynamic = "force-dynamic";

async function count(where: Promise<{ n: number }[]>): Promise<number> {
  return (await where)[0]?.n ?? 0;
}

export default async function SanctumToday() {
  const [live, petitions] = await Promise.all([
    liveListeners(),
    pendingPetitions(),
  ]);
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
              <p className="nums-lining mt-1 text-3xl font-[family-name:var(--font-display)]">
                {t.value}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {/* R9.5: collar petitions awaiting her word — accept (ritual + push) or
          decline (silence). Only shows when someone is kneeling for it. */}
      {petitions.length > 0 ? (
        <div className="mt-10">
          <div className="flex items-baseline gap-3">
            <Display as="h2" className="text-xl">
              Petitions for your collar
            </Display>
            <Badge tone="gold">{petitions.length}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {petitions.map((p) => (
              <Card key={p.userId} raised className="border-gold/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/sanctum/subjects/${p.userId}`}
                      className="font-[family-name:var(--font-display)] text-lg text-text hover:text-gold"
                    >
                      {p.name ?? p.email ?? p.userId.slice(0, 8)}
                    </Link>
                    <Whisper className="text-xs">
                      kneels for the collar · asked {formatWhen(p.petitionedAt)}
                    </Whisper>
                  </div>
                  <div className="flex gap-2">
                    <form action={acceptOathAction}>
                      <input type="hidden" name="userId" value={p.userId} />
                      <Button type="submit" size="sm" variant="gold">
                        Accept
                      </Button>
                    </form>
                    <form action={declineOathAction}>
                      <input type="hidden" name="userId" value={p.userId} />
                      <Button type="submit" size="sm" variant="ghost">
                        Decline
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* R9.1: who is under right now — one-tap touch, fuller room one click away. */}
      <div className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <Display as="h2" className="text-xl">
            Now, under
          </Display>
          <Link
            href="/sanctum/live"
            className="text-xs uppercase tracking-[0.1em] text-text-dim transition-colors hover:text-gold"
          >
            The live room →
          </Link>
        </div>
        <div className="mt-3">
          <LivePanel initial={live} compact />
        </div>
      </div>
    </div>
  );
}
