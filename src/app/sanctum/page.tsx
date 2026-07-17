import Link from "next/link";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  orderAssignments,
  reviewQueue,
  tracks,
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

  // "Awaiting you" — the actionable backlog, each a count + one-line label + link.
  const [proofs, pendingReviews, newComms, newWishes, shells] = await Promise.all(
    [
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(orderAssignments)
          .where(
            and(
              isNotNull(orderAssignments.proofKey),
              isNull(orderAssignments.praisedAt),
            ),
          ),
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
          .where(inArray(commissions.status, ["new", "reviewing"])),
      ),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(wishes)
          .where(eq(wishes.status, "new")),
      ),
      count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(tracks)
          .where(and(eq(tracks.source, "patreon_import"), isNull(tracks.streamKey))),
      ),
    ],
  );

  const awaiting = [
    { label: "Proofs to review", value: proofs, href: "/sanctum/orders" },
    { label: "Waiting on your review", value: pendingReviews, href: "/sanctum/organize" },
    { label: "New commissions", value: newComms, href: "/sanctum/commissions" },
    { label: "New asks", value: newWishes, href: "/sanctum/wishes" },
    { label: "Shells waiting for audio", value: shells, href: "/sanctum/import" },
  ];
  const totalAwaiting = awaiting.reduce((s, a) => s + a.value, 0);

  return (
    <div>
      <Display className="text-3xl">Today</Display>
      <Whisper className="mt-1">Everything that wants you.</Whisper>

      {/* R9.1: who is under right now — one-tap touch, fuller room one click away. */}
      <div className="mt-8">
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

      {/* Awaiting you — the actionable backlog in one strip. */}
      <div className="mt-10">
        <Display as="h2" className="text-xl">
          Awaiting you
        </Display>
        <Card className="mt-3 divide-y divide-line/60 p-0">
          {totalAwaiting === 0 ? (
            <Whisper className="p-4">Nothing waits for you. The room is quiet.</Whisper>
          ) : (
            awaiting.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="group flex items-center gap-4 px-4 py-3 transition-colors duration-[var(--dur-med)] hover:bg-surface-raised"
              >
                <span
                  className={`nums-lining w-8 shrink-0 text-right font-[family-name:var(--font-display)] text-xl ${
                    a.value > 0 ? "text-gold" : "text-text-dim/40"
                  }`}
                >
                  {a.value}
                </span>
                <span
                  className={`flex-1 text-sm ${
                    a.value > 0 ? "text-text" : "text-text-dim"
                  }`}
                >
                  {a.label}
                </span>
                <span className="shrink-0 text-text-dim transition-colors group-hover:text-gold">
                  →
                </span>
              </Link>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
