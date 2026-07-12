import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dropReports,
  listenSessions,
  resumePoints,
  tracks,
  users,
} from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { listLibraryTracks, getAccessibleTrack } from "@/lib/library/queries";
import { recordDropReport, recordEnd, recordHeartbeat } from "./record";

/**
 * Integration test for the M1 listen loop (PLAN §9): heartbeats grow the
 * session + resume point, end computes completion at 85%, a completed track
 * clears its resume point, and drop reports persist. Also checks the library
 * entitlement filter.
 */
async function makeUser(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "subject" }).returning();
  return u!.id;
}

async function makeTrack(opts: {
  durationS: number;
  minAccessLevel?: number;
  visibility?: "draft" | "published";
}): Promise<string> {
  const [t] = await db
    .insert(tracks)
    .values({
      title: "Descent",
      slug: `descent-${Math.round(opts.durationS)}-${Math.random().toString(36).slice(2, 8)}`,
      durationS: opts.durationS,
      streamKey: "stream/x.m4a",
      minAccessLevel: opts.minAccessLevel ?? 1,
      visibility: opts.visibility ?? "published",
      publishedAt: new Date(),
    })
    .returning();
  return t!.id;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await truncateAll();
});

describe("listen recording", () => {
  it("heartbeat creates a session and resume point; both only grow", async () => {
    const userId = await makeUser();
    const trackId = await makeTrack({ durationS: 600 });
    const sessionId = crypto.randomUUID();

    await recordHeartbeat({ sessionId, userId, trackId, positionS: 30, secondsListened: 30 });
    await recordHeartbeat({ sessionId, userId, trackId, positionS: 90, secondsListened: 88 });
    // A stale/rewound heartbeat must not shrink stored values.
    await recordHeartbeat({ sessionId, userId, trackId, positionS: 10, secondsListened: 5 });

    const [s] = await db.select().from(listenSessions).where(eq(listenSessions.id, sessionId));
    expect(s?.maxPositionS).toBe(90);
    expect(s?.secondsListened).toBe(88);

    const [rp] = await db
      .select()
      .from(resumePoints)
      .where(eq(resumePoints.userId, userId));
    expect(rp?.positionS).toBe(10); // resume follows the latest position
  });

  it("end below 85% is not complete and keeps the resume point", async () => {
    const userId = await makeUser();
    const trackId = await makeTrack({ durationS: 100 });
    const sessionId = crypto.randomUUID();
    await recordHeartbeat({ sessionId, userId, trackId, positionS: 50, secondsListened: 50 });
    const { completed } = await recordEnd({
      sessionId,
      userId,
      trackId,
      positionS: 50,
      endReason: "stopped",
    });
    expect(completed).toBe(false);
    const rp = await db.select().from(resumePoints).where(eq(resumePoints.userId, userId));
    expect(rp).toHaveLength(1);
  });

  it("end at >=85% is complete and clears the resume point", async () => {
    const userId = await makeUser();
    const trackId = await makeTrack({ durationS: 100 });
    const sessionId = crypto.randomUUID();
    await recordHeartbeat({ sessionId, userId, trackId, positionS: 80, secondsListened: 80 });
    const { completed } = await recordEnd({
      sessionId,
      userId,
      trackId,
      positionS: 90,
      endReason: "finished",
    });
    expect(completed).toBe(true);
    const rp = await db.select().from(resumePoints).where(eq(resumePoints.userId, userId));
    expect(rp).toHaveLength(0);
  });

  it("drop report persists once per session", async () => {
    const userId = await makeUser();
    const trackId = await makeTrack({ durationS: 100 });
    const sessionId = crypto.randomUUID();
    await recordHeartbeat({ sessionId, userId, trackId, positionS: 90, secondsListened: 90 });
    await recordEnd({ sessionId, userId, trackId, positionS: 95, endReason: "finished" });
    await recordDropReport({ sessionId, userId, trackId, depth: 5, note: "gone" });
    await recordDropReport({ sessionId, userId, trackId, depth: 1, note: "dup" });
    const reports = await db.select().from(dropReports);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.depth).toBe(5);
  });
});

describe("library entitlement filter", () => {
  it("marks tracks unlocked based on access level", async () => {
    const uid = await makeUser();
    await makeTrack({ durationS: 100, minAccessLevel: 1 });
    await makeTrack({ durationS: 100, minAccessLevel: 3 });
    const atLevel1 = await listLibraryTracks(uid, 1);
    expect(atLevel1.find((t) => t.minAccessLevel === 1)?.unlocked).toBe(true);
    expect(atLevel1.find((t) => t.minAccessLevel === 3)?.unlocked).toBe(false);
  });

  it("getAccessibleTrack returns null when sealed and the track when allowed", async () => {
    const uid = await makeUser();
    const sealedId = await makeTrack({ durationS: 100, minAccessLevel: 3 });
    expect(await getAccessibleTrack(sealedId, uid, 1)).toBeNull();
    expect(await getAccessibleTrack(sealedId, uid, 3)).not.toBeNull();
  });

  it("drafts never appear in the library", async () => {
    const uid = await makeUser();
    await makeTrack({ durationS: 100, visibility: "draft" });
    const list = await listLibraryTracks(uid, 5);
    expect(list).toHaveLength(0);
  });
});
