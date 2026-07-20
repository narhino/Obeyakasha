import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { chainEvents, chains, users } from "@/lib/db/schema";
import { recordRankProgress } from "@/lib/ranks/promote";
import { localDate, nextChainState, previousDay } from "./logic";

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

  // Chain length feeds the rank score — a fresh keep may cross a threshold.
  // Covers every chain-growth caller (listen, mantra, order) in one place.
  await recordRankProgress(userId);

  return { currentLen: next.currentLen, kept: true };
}

export interface ChainDay {
  /** YYYY-MM-DD in the subject's timezone. */
  date: string;
  /** Was the chain kept that day? */
  lit: boolean;
  /** Is this today (the day still in play)? */
  today: boolean;
}

/**
 * The recent chain window (F5) — the last `span` days as lit/unlit links, plus
 * whether today is already held. Drives the "chain made visible" row and the
 * mantra rite's rest-state on the Mirror. One small indexed read.
 */
export async function chainWindow(
  userId: string,
  timezone: string,
  span = 10,
): Promise<{ days: ChainDay[]; heldToday: boolean; today: string }> {
  const today = localDate(new Date(), timezone);
  let earliest = today;
  for (let i = 0; i < span - 1; i++) earliest = previousDay(earliest);

  const rows = await db
    .select({ date: chainEvents.date })
    .from(chainEvents)
    .where(and(eq(chainEvents.userId, userId), gte(chainEvents.date, earliest)));
  const kept = new Set(rows.map((r) => r.date));

  const days: ChainDay[] = [];
  let d = today;
  for (let i = 0; i < span; i++) {
    days.unshift({ date: d, lit: kept.has(d), today: d === today });
    d = previousDay(d);
  }
  return { days, heldToday: kept.has(today), today };
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
