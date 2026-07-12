import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chainEvents, chains, users } from "@/lib/db/schema";
import { localDate, nextChainState } from "./logic";

/**
 * Keep the chain for the subject "today" (their timezone). Idempotent per day.
 * Called when a subject listens ≥ threshold or types the mantra (A7).
 */
export async function keepChain(
  userId: string,
  kind: "listen" | "mantra",
): Promise<{ currentLen: number; kept: boolean }> {
  const [user] = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const today = localDate(new Date(), user?.tz ?? "UTC");

  // Already kept today?
  const [existingEvent] = await db
    .select()
    .from(chainEvents)
    .where(and(eq(chainEvents.userId, userId), eq(chainEvents.date, today)))
    .limit(1);

  const [existingChain] = await db
    .select()
    .from(chains)
    .where(eq(chains.userId, userId))
    .limit(1);

  if (existingEvent) {
    return { currentLen: existingChain?.currentLen ?? 1, kept: false };
  }

  await db
    .insert(chainEvents)
    .values({ userId, date: today, kind })
    .onConflictDoNothing();

  const prev = {
    currentLen: existingChain?.currentLen ?? 0,
    bestLen: existingChain?.bestLen ?? 0,
    lastKeptDate: existingChain?.lastKeptDate ?? null,
  };
  const next = nextChainState(prev, today);

  await db
    .insert(chains)
    .values({
      userId,
      currentLen: next.currentLen,
      bestLen: next.bestLen,
      lastKeptDate: next.lastKeptDate,
    })
    .onConflictDoUpdate({
      target: chains.userId,
      set: {
        currentLen: next.currentLen,
        bestLen: next.bestLen,
        lastKeptDate: next.lastKeptDate,
      },
    });

  return { currentLen: next.currentLen, kept: true };
}

export async function getChain(
  userId: string,
): Promise<{ currentLen: number; bestLen: number; lastKeptDate: string | null }> {
  const [c] = await db
    .select()
    .from(chains)
    .where(eq(chains.userId, userId))
    .limit(1);
  return {
    currentLen: c?.currentLen ?? 0,
    bestLen: c?.bestLen ?? 0,
    lastKeptDate: c?.lastKeptDate ?? null,
  };
}
