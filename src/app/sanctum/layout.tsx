import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { requireGoddess } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { messages, orderAssignments, reviewQueue, users } from "@/lib/db/schema";
import { pendingPetitions } from "@/lib/oath/resolve";
import { SanctumNav, type NavCounts } from "./SanctumNav";

// The rail carries live counts, so never serve a stale shell.
export const dynamic = "force-dynamic";

/** One cheap COUNT, fail-soft to 0 so a slow/absent table never blanks the rail. */
function count(where: Promise<{ n: number }[]>): Promise<number> {
  return where.then((r) => r[0]?.n ?? 0).catch(() => 0);
}

async function navCounts(): Promise<NavCounts> {
  const [today, review, unread, tasks] = await Promise.all([
    // Open collar petitions awaiting her word.
    pendingPetitions()
      .then((p) => p.length)
      .catch(() => 0),
    // Review queue items still pending.
    count(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(reviewQueue)
        .where(eq(reviewQueue.status, "pending")),
    ),
    // Unread messages from subjects.
    count(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.sender, "subject"), isNull(messages.readAt))),
    ),
    // Proofs attached but not yet praised (awaiting review).
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
  ]);
  return { today, review, messages: unread, tasks };
}

export default async function SanctumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireGoddess();
  const counts = await navCounts();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[230px_1fr]">
      <aside
        className="border-b border-line/70 bg-surface md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-b-0 md:border-r"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="p-5 md:p-6">
          <p className="font-[family-name:var(--font-display)] text-xs tracking-[0.3em] text-text-dim">
            888
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-medium text-gold">
            The Sanctum
          </p>

          <SanctumNav counts={counts} />

          <form
            className="mt-6 hidden md:block"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="text-[0.6875rem] tracking-[0.14em] uppercase text-text-dim/50 transition-colors hover:text-text-dim">
              Step out
            </button>
          </form>
        </div>
      </aside>
      <main className="p-5 md:p-10">{children}</main>
    </div>
  );
}
