import { describe, expect, it } from "vitest";
import {
  LIVE_WINDOW_MS,
  isSessionLive,
  toLiveListener,
} from "./live";

/**
 * Pure unit tests for the R9.1 live-view logic — no DB. The window filter and
 * the minutes-in / depth shaping are the parts worth pinning down; the query
 * that feeds them is exercised by the app.
 */
const now = new Date("2026-07-17T12:00:00.000Z");

describe("isSessionLive", () => {
  it("is live when open and the heartbeat is fresh", () => {
    const beat = new Date(now.getTime() - 5_000); // 5s ago
    expect(isSessionLive({ endedAt: null, lastHeartbeatAt: beat }, now)).toBe(true);
  });

  it("is not live once the session has ended, even with a fresh beat", () => {
    const beat = new Date(now.getTime() - 5_000);
    expect(
      isSessionLive({ endedAt: now, lastHeartbeatAt: beat }, now),
    ).toBe(false);
  });

  it("is not live when the heartbeat is older than the window", () => {
    const stale = new Date(now.getTime() - (LIVE_WINDOW_MS + 1_000));
    expect(isSessionLive({ endedAt: null, lastHeartbeatAt: stale }, now)).toBe(false);
  });

  it("is live exactly at the window edge", () => {
    const edge = new Date(now.getTime() - LIVE_WINDOW_MS);
    expect(isSessionLive({ endedAt: null, lastHeartbeatAt: edge }, now)).toBe(true);
  });

  it("is not live with no heartbeat ever recorded", () => {
    expect(isSessionLive({ endedAt: null, lastHeartbeatAt: null }, now)).toBe(false);
  });

  it("treats a future heartbeat (clock skew) as live", () => {
    const future = new Date(now.getTime() + 3_000);
    expect(isSessionLive({ endedAt: null, lastHeartbeatAt: future }, now)).toBe(true);
  });
});

describe("toLiveListener", () => {
  const base = {
    sessionId: "s1",
    userId: "u1",
    name: "kitten",
    trackId: "t1",
    trackTitle: "Deep Water",
    startedAt: new Date(now.getTime() - 8 * 60_000), // 8 minutes ago
    positionS: 300,
    durationS: 600,
  };

  it("computes whole minutes in and depth percent", () => {
    const v = toLiveListener(base, now);
    expect(v.minutesIn).toBe(8);
    expect(v.depthPct).toBe(50);
    expect(v.name).toBe("kitten");
  });

  it("caps depth at 100 when position runs past the duration", () => {
    const v = toLiveListener({ ...base, positionS: 900, durationS: 600 }, now);
    expect(v.depthPct).toBe(100);
  });

  it("returns null depth when the duration is unknown", () => {
    const v = toLiveListener({ ...base, durationS: null }, now);
    expect(v.depthPct).toBeNull();
  });

  it("never reports negative minutes for a just-started session", () => {
    const v = toLiveListener({ ...base, startedAt: now }, now);
    expect(v.minutesIn).toBe(0);
  });

  it("falls back to a soft label when the collar name is missing", () => {
    const v = toLiveListener({ ...base, name: null }, now);
    expect(v.name).toBe("one of mine");
  });
});
