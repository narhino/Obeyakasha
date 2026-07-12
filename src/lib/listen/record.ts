import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dropReports,
  listenSessions,
  resumePoints,
  trackTriggers,
  tracks,
  userTriggers,
} from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { keepChain } from "@/lib/chain/keep";
import { isComplete } from "./completion";

/** On a completed listen, add any triggers this track INSTALLS to the vault (A5). */
async function grantInstalledTriggers(userId: string, trackId: string) {
  const installs = await db
    .select({ triggerId: trackTriggers.triggerId })
    .from(trackTriggers)
    .where(
      and(
        eq(trackTriggers.trackId, trackId),
        eq(trackTriggers.relation, "installs"),
      ),
    );
  for (const t of installs) {
    await db
      .insert(userTriggers)
      .values({ userId, triggerId: t.triggerId, acquiredViaTrackId: trackId })
      .onConflictDoNothing();
  }
}

type EndReason = "finished" | "stopped" | "grounded" | "abandoned";

/**
 * Upsert a listen session from a heartbeat and keep the resume point current
 * (PLAN §9). Idempotent per sessionId; secondsListened and maxPositionS only
 * ever grow.
 */
export async function recordHeartbeat(params: {
  sessionId: string;
  userId: string;
  trackId: string;
  positionS: number;
  secondsListened: number;
}) {
  const { sessionId, userId, trackId, positionS, secondsListened } = params;

  await db
    .insert(listenSessions)
    .values({
      id: sessionId,
      userId,
      trackId,
      secondsListened,
      maxPositionS: Math.round(positionS),
    })
    .onConflictDoUpdate({
      target: listenSessions.id,
      set: {
        secondsListened: sql`greatest(${listenSessions.secondsListened}, ${secondsListened})`,
        maxPositionS: sql`greatest(${listenSessions.maxPositionS}, ${Math.round(positionS)})`,
      },
    });

  await db
    .insert(resumePoints)
    .values({ userId, trackId, positionS: Math.round(positionS) })
    .onConflictDoUpdate({
      target: [resumePoints.userId, resumePoints.trackId],
      set: { positionS: Math.round(positionS), updatedAt: new Date() },
    });
}

/** Finalize a session; compute completion against the track duration. */
export async function recordEnd(params: {
  sessionId: string;
  userId: string;
  trackId: string;
  positionS: number;
  endReason: EndReason;
}) {
  const { sessionId, userId, trackId, positionS, endReason } = params;

  const [track] = await db
    .select({ durationS: tracks.durationS })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);

  // Ensure a row exists (in case end arrives before any heartbeat).
  await db
    .insert(listenSessions)
    .values({
      id: sessionId,
      userId,
      trackId,
      maxPositionS: Math.round(positionS),
    })
    .onConflictDoNothing({ target: listenSessions.id });

  const [existing] = await db
    .select({ maxPositionS: listenSessions.maxPositionS })
    .from(listenSessions)
    .where(eq(listenSessions.id, sessionId))
    .limit(1);

  const [sessionRow] = await db
    .select({ secondsListened: listenSessions.secondsListened })
    .from(listenSessions)
    .where(eq(listenSessions.id, sessionId))
    .limit(1);
  const maxPos = Math.max(existing?.maxPositionS ?? 0, Math.round(positionS));
  const completed = isComplete(maxPos, track?.durationS);

  // Keep the Chain of Obedience if they listened enough today (A7).
  const chainMin = await getSetting("chain_min_seconds");
  if ((sessionRow?.secondsListened ?? 0) >= chainMin) {
    await keepChain(userId, "listen").catch(() => {});
  }

  await db
    .update(listenSessions)
    .set({
      endedAt: new Date(),
      endReason,
      maxPositionS: maxPos,
      completed,
    })
    .where(
      and(
        eq(listenSessions.id, sessionId),
        eq(listenSessions.userId, userId),
      ),
    );

  // Clear resume point once a track is completed (finished cleanly).
  if (completed) {
    await db
      .delete(resumePoints)
      .where(
        and(eq(resumePoints.userId, userId), eq(resumePoints.trackId, trackId)),
      );
    await grantInstalledTriggers(userId, trackId);
  }

  return { completed };
}

/** Record a drop report for a session (PLAN §9, A9). One per session. */
export async function recordDropReport(params: {
  sessionId: string;
  userId: string;
  trackId: string;
  depth: number;
  note: string | null;
}) {
  await db
    .insert(dropReports)
    .values({
      listenSessionId: params.sessionId,
      userId: params.userId,
      trackId: params.trackId,
      depth: params.depth,
      note: params.note,
    })
    .onConflictDoNothing({ target: dropReports.listenSessionId });
}
