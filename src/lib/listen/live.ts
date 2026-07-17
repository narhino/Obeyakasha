import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { listenSessions, moments, tracks, users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

/**
 * "She sees you" (R9.1) — the live room. A subject counts as *currently under*
 * only while their listen session is open (no `endedAt`) AND a heartbeat has
 * landed within this window. Heartbeats fire roughly every 10s of playback, so
 * 90s tolerates a couple of missed beats (a paused tab, a network blip) before
 * they drop off her live view.
 */
export const LIVE_WINDOW_MS = 90_000;

/** How long an unshown "touch" moment stays deliverable before it expires — it
 *  is a live gesture, meaningless once the session it was meant for is long over. */
export const TOUCH_TTL_MS = 10 * 60_000;

/** Pure: is this session live at `now`? Open + a heartbeat inside the window. A
 *  heartbeat stamped slightly in the future (clock skew across machines) counts
 *  as live rather than being discarded. */
export function isSessionLive(
  row: { endedAt: Date | null; lastHeartbeatAt: Date | null },
  now: Date,
  windowMs: number = LIVE_WINDOW_MS,
): boolean {
  if (row.endedAt) return false;
  if (!row.lastHeartbeatAt) return false;
  const delta = now.getTime() - row.lastHeartbeatAt.getTime();
  if (delta < 0) return true; // future stamp — clock skew, treat as live
  return delta <= windowMs;
}

/** One row of the live view (goddess-only surface). `name` is the collar name. */
export interface LiveListener {
  sessionId: string;
  userId: string;
  name: string;
  trackId: string;
  trackTitle: string;
  /** Whole minutes since the session opened. */
  minutesIn: number;
  /** Furthest position reached, seconds. */
  positionS: number;
  durationS: number | null;
  /** Position as a share of the track (0..100), or null when duration unknown. */
  depthPct: number | null;
}

/** Pure: shape one joined row into a LiveListener (minutes in + depth position). */
export function toLiveListener(
  row: {
    sessionId: string;
    userId: string;
    name: string | null;
    trackId: string;
    trackTitle: string;
    startedAt: Date;
    positionS: number;
    durationS: number | null;
  },
  now: Date,
): LiveListener {
  const minutesIn = Math.max(
    0,
    Math.floor((now.getTime() - row.startedAt.getTime()) / 60_000),
  );
  const depthPct =
    row.durationS && row.durationS > 0
      ? Math.min(100, Math.max(0, Math.round((row.positionS / row.durationS) * 100)))
      : null;
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    // Collar name should always be set (intake gates listening); fall back softly.
    name: row.name ?? "one of mine",
    trackId: row.trackId,
    trackTitle: row.trackTitle,
    minutesIn,
    positionS: row.positionS,
    durationS: row.durationS,
    depthPct,
  };
}

/**
 * Everyone currently under, freshest heartbeat first (R9.1). Goddess-only — this
 * joins collar names and is never exposed to a subject (D7).
 */
export async function liveListeners(now: Date = new Date()): Promise<LiveListener[]> {
  const cutoff = new Date(now.getTime() - LIVE_WINDOW_MS);
  const rows = await db
    .select({
      sessionId: listenSessions.id,
      userId: listenSessions.userId,
      name: users.chosenName,
      trackId: listenSessions.trackId,
      trackTitle: tracks.title,
      startedAt: listenSessions.startedAt,
      positionS: listenSessions.maxPositionS,
      durationS: tracks.durationS,
    })
    .from(listenSessions)
    .innerJoin(users, eq(users.id, listenSessions.userId))
    .innerJoin(tracks, eq(tracks.id, listenSessions.trackId))
    .where(
      and(
        isNull(listenSessions.endedAt),
        gte(listenSessions.lastHeartbeatAt, cutoff),
      ),
    )
    .orderBy(desc(listenSessions.lastHeartbeatAt))
    .limit(100);

  return rows.map((r) => toLiveListener(r, now));
}

/**
 * Drop one of her lines into a subject's live session as a "touch" moment
 * (R9.1). NO push — they are already in-app; it surfaces as the quiet
 * neck-touch overlay on the subject's next live poll. Audited.
 */
export async function sendTouch(
  actorId: string,
  userId: string,
  text: string,
): Promise<void> {
  await db.insert(moments).values({ userId, kind: "touch", payload: { text } });
  await logAudit(actorId, "touch.sent", { userId });
}
