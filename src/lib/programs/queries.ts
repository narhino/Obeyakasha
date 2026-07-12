import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  listenSessions,
  programItems,
  programs,
  tracks,
} from "@/lib/db/schema";
import { canAccess } from "@/lib/entitlements/core";
import { computeGates, type Gating } from "./gating";

export interface ProgramItemView {
  trackId: string;
  title: string;
  durationS: number | null;
  dayNumber: number | null;
  minAccessLevel: number;
  completed: boolean;
  unlocked: boolean;
  unlocksAt: number | null;
  accessAllowed: boolean;
}

export interface ProgramView {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  gating: Gating;
  cadence: "ongoing" | "weekly" | "ended";
  minAccessLevel: number;
  accessAllowed: boolean;
  items: ProgramItemView[];
  completedCount: number;
}

/** Completed track ids for a user, mapped to their latest completion time. */
async function completionsByTrack(
  userId: string,
  trackIds: string[],
): Promise<Map<string, number>> {
  if (trackIds.length === 0) return new Map();
  const rows = await db
    .select({
      trackId: listenSessions.trackId,
      endedAt: listenSessions.endedAt,
    })
    .from(listenSessions)
    .where(
      and(
        eq(listenSessions.userId, userId),
        eq(listenSessions.completed, true),
        inArray(listenSessions.trackId, trackIds),
      ),
    );
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = r.endedAt ? r.endedAt.getTime() : Date.now();
    map.set(r.trackId, Math.max(map.get(r.trackId) ?? 0, t));
  }
  return map;
}

/** All published programs for a subject, with per-item lock state. */
export async function listProgramsForSubject(
  userId: string,
  accessLevel: number,
  now = Date.now(),
): Promise<ProgramView[]> {
  const progs = await db
    .select()
    .from(programs)
    .where(eq(programs.visibility, "published"))
    .orderBy(asc(programs.createdAt));
  if (progs.length === 0) return [];

  const items = await db
    .select({
      programId: programItems.programId,
      trackId: programItems.trackId,
      dayNumber: programItems.dayNumber,
      sort: programItems.sort,
      title: tracks.title,
      durationS: tracks.durationS,
      minAccessLevel: tracks.minAccessLevel,
    })
    .from(programItems)
    .innerJoin(tracks, eq(tracks.id, programItems.trackId))
    .where(
      inArray(
        programItems.programId,
        progs.map((p) => p.id),
      ),
    );

  const completions = await completionsByTrack(
    userId,
    items.map((i) => i.trackId),
  );

  return progs.map((p) => {
    const own = items
      .filter((i) => i.programId === p.id)
      .sort((a, b) => a.sort - b.sort);

    const gates = computeGates(
      p.gating,
      own.map((i, index) => ({
        index,
        completedAt: completions.get(i.trackId) ?? null,
      })),
      now,
    );

    const itemViews: ProgramItemView[] = own.map((i, index) => {
      const gate = gates[index]!;
      const completed = completions.has(i.trackId);
      const accessAllowed = canAccess(accessLevel, i.minAccessLevel);
      return {
        trackId: i.trackId,
        title: i.title,
        durationS: i.durationS,
        dayNumber: i.dayNumber,
        minAccessLevel: i.minAccessLevel,
        completed,
        unlocked: gate.unlocked && accessAllowed,
        unlocksAt: gate.unlocksAt ?? null,
        accessAllowed,
      };
    });

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      description: p.description,
      gating: p.gating,
      cadence: p.cadence,
      minAccessLevel: p.minAccessLevel,
      accessAllowed: canAccess(accessLevel, p.minAccessLevel),
      items: itemViews,
      completedCount: itemViews.filter((i) => i.completed).length,
    };
  });
}
