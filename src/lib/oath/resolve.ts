import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { chains, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { daysUntilEligible, oathState, type OathState } from "./logic";

export interface OathStatus {
  state: OathState;
  /** Unbroken chain days the subject currently holds. */
  currentStreak: number;
  /** Days the chain must reach (setting oath_min_streak). */
  minStreak: number;
  /** Days still owed before the petition unseals (0 once eligible+). */
  daysRemaining: number;
  /** When she collared them — non-null only in the `collared` state. */
  oathAt: Date | null;
}

/**
 * Resolve a subject's full Oath status (R9.5) — the state machine fed by their
 * two timestamps + their live chain length + the streak threshold. Drives the
 * collar card on the You page.
 */
export async function oathStatusFor(userId: string): Promise<OathStatus> {
  const [row, chainRow, minStreak] = await Promise.all([
    db
      .select({ oathAt: users.oathAt, oathPetitionedAt: users.oathPetitionedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ currentLen: chains.currentLen })
      .from(chains)
      .where(eq(chains.userId, userId))
      .limit(1),
    getSetting("oath_min_streak"),
  ]);

  const oathAt = row[0]?.oathAt ?? null;
  const oathPetitionedAt = row[0]?.oathPetitionedAt ?? null;
  const currentStreak = chainRow[0]?.currentLen ?? 0;

  return {
    state: oathState({ oathAt, oathPetitionedAt, currentStreak, minStreak }),
    currentStreak,
    minStreak,
    daysRemaining: daysUntilEligible(currentStreak, minStreak),
    oathAt,
  };
}

/** Is this subject collared? (feeds the feed's `oath` audience filter, R9.5). */
export async function isCollared(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ oathAt: users.oathAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.oathAt);
}

export interface PendingPetition {
  userId: string;
  name: string | null;
  email: string | null;
  petitionedAt: Date;
}

/**
 * Open collar petitions awaiting her word — oathPetitionedAt set, oathAt still
 * null (R9.5). Surfaced on Today + the subject profile so she can accept or
 * decline. Oldest first: the ones who have waited longest.
 */
export async function pendingPetitions(): Promise<PendingPetition[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.chosenName,
      email: users.email,
      petitionedAt: users.oathPetitionedAt,
    })
    .from(users)
    .where(
      and(isNotNull(users.oathPetitionedAt), isNull(users.oathAt)),
    )
    .orderBy(desc(users.oathPetitionedAt));
  return rows
    .filter((r): r is PendingPetition => r.petitionedAt != null)
    .sort((a, b) => a.petitionedAt.getTime() - b.petitionedAt.getTime());
}
