import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  listenSessions,
  programProgress,
  triggers,
  userTriggers,
  users,
} from "@/lib/db/schema";
import { getChain } from "@/lib/chain/keep";

export interface CollarCard {
  chosenName: string | null;
  honorific: string | null;
  claimedAt: Date;
  chain: { currentLen: number; bestLen: number };
  triggersHeld: { name: string; acquiredAt: Date }[];
  programsCompleted: number;
  listeningHours: number;
  filesCompleted: number;
}

/** Assemble a subject's Collar Card (A2). */
export async function collarCard(userId: string): Promise<CollarCard | null> {
  const [user] = await db
    .select({
      chosenName: users.chosenName,
      honorific: users.honorific,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [chain, held, secsRows, doneRows, progRows] = await Promise.all([
    getChain(userId),
    db
      .select({ name: triggers.name, acquiredAt: userTriggers.acquiredAt })
      .from(userTriggers)
      .innerJoin(triggers, eq(triggers.id, userTriggers.triggerId))
      .where(eq(userTriggers.userId, userId)),
    db
      .select({
        secs: sql<number>`coalesce(sum(${listenSessions.secondsListened}),0)::int`,
      })
      .from(listenSessions)
      .where(eq(listenSessions.userId, userId)),
    db
      .select({ done: count() })
      .from(listenSessions)
      .where(
        and(
          eq(listenSessions.userId, userId),
          eq(listenSessions.completed, true),
        ),
      ),
    db
      .select({ progs: count() })
      .from(programProgress)
      .where(
        and(
          eq(programProgress.userId, userId),
          sql`${programProgress.completedAt} is not null`,
        ),
      ),
  ]);

  const secs = secsRows[0]?.secs ?? 0;
  return {
    chosenName: user.chosenName,
    honorific: user.honorific,
    claimedAt: user.createdAt,
    chain: { currentLen: chain.currentLen, bestLen: chain.bestLen },
    triggersHeld: held,
    programsCompleted: progRows[0]?.progs ?? 0,
    listeningHours: Math.round((secs / 3600) * 10) / 10,
    filesCompleted: doneRows[0]?.done ?? 0,
  };
}
