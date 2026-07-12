import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock web-push so no real network calls happen; capture sent payloads.
const sendNotification = vi.fn(async (..._args: unknown[]) => ({
  statusCode: 201,
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { db } from "@/lib/db";
import {
  devices,
  entitlements,
  notificationDeliveries,
  users,
} from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { expandAudience } from "./audience";
import { broadcast } from "./broadcast";

async function makeSubject(opts?: {
  name?: string;
  timezone?: string;
  level?: number;
}): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({
      role: "subject",
      chosenName: opts?.name,
      timezone: opts?.timezone ?? "UTC",
    })
    .returning();
  if (opts?.level != null) {
    await db.insert(entitlements).values({
      userId: u!.id,
      source: "patreon",
      accessLevel: opts.level,
      status: "active",
    });
  }
  return u!.id;
}

async function giveDevice(userId: string) {
  await db.insert(devices).values({
    id: crypto.randomUUID(),
    userId,
    platform: "ios",
    pushEnabled: true,
    installed: true,
    pushSubscription: {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "p", auth: "a" },
    },
  });
}

beforeEach(async () => {
  await truncateAll();
  sendNotification.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("expandAudience", () => {
  it("all → every active subject", async () => {
    const a = await makeSubject();
    const b = await makeSubject();
    const ids = await expandAudience({ type: "all" });
    expect(new Set(ids)).toEqual(new Set([a, b]));
  });

  it("level → subjects at or above the level", async () => {
    const low = await makeSubject({ level: 1 });
    const high = await makeSubject({ level: 3 });
    const ids = await expandAudience({ type: "level", level: 2 });
    expect(ids).toContain(high);
    expect(ids).not.toContain(low);
  });

  it("users → exactly the given ids", async () => {
    const a = await makeSubject();
    await makeSubject();
    const ids = await expandAudience({ type: "users", userIds: [a] });
    expect(ids).toEqual([a]);
  });
});

describe("broadcast", () => {
  it("delivers to a push-enabled device and records 'sent'", async () => {
    const uid = await makeSubject({ name: "Marc" });
    await giveDevice(uid);

    const stats = await broadcast({
      title: "Come back to me, {name}.",
      audience: { type: "all" },
      respectQuietHours: false,
    });

    expect(stats.recipients).toBe(1);
    expect(stats.sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    // Personalization applied.
    const payload = JSON.parse(
      (sendNotification.mock.calls[0]![1] as string) ?? "{}",
    );
    expect(payload.title).toBe("Come back to me, Marc.");

    const deliveries = await db
      .select()
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, uid));
    expect(deliveries[0]?.status).toBe("sent");
  });

  it("counts a recipient with no device as skippedNoDevice", async () => {
    await makeSubject();
    const stats = await broadcast({
      title: "hi",
      audience: { type: "all" },
      respectQuietHours: false,
    });
    expect(stats.recipients).toBe(1);
    expect(stats.sent).toBe(0);
    expect(stats.skippedNoDevice).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("holds back a subject inside quiet hours (non-system)", async () => {
    // Quiet window covering all 24h so it's always 'quiet' regardless of run time.
    const uid = await makeSubject();
    await giveDevice(uid);
    await db
      .update(users)
      .set({ quietHoursStart: 0, quietHoursEnd: 23 })
      .where(eq(users.id, uid));
    // Note: 0..23 leaves only hour 23 as non-quiet; to be deterministic we assert
    // that when quiet, nothing is sent. Use a full-day window via two calls is
    // overkill — instead set tz to a fixed offset and window [0,24) not allowed,
    // so we validate the skip path with respectQuietHours and a guaranteed-quiet
    // hour by setting the window to the current UTC hour.
    const nowHour = new Date().getUTCHours();
    await db
      .update(users)
      .set({
        timezone: "UTC",
        quietHoursStart: nowHour,
        quietHoursEnd: (nowHour + 1) % 24,
      })
      .where(eq(users.id, uid));

    const stats = await broadcast({
      title: "shh",
      audience: { type: "all" },
      respectQuietHours: true,
    });
    expect(stats.skippedQuiet).toBe(1);
    expect(stats.sent).toBe(0);
  });
});
