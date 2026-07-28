import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { devices, notificationDeliveries, notifications, users } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import {
  pushHealth,
  reachFor,
  subjectNotifications,
  subjectReach,
} from "./receipts";

/**
 * These run the real queries against the real database, which is the only thing
 * that would have caught the bug they exist for.
 *
 * `pushHealth` shipped with `sql\`${column} >= ${since}\`` — a JS Date
 * interpolated into a raw template. Drizzle binds it as an untyped parameter
 * and postgres.js cannot serialize a Date without a column type to encode
 * against, so it threw at BIND time: no type error, no lint error, a clean
 * build, and a 500 the moment the page was opened. Typecheck cannot see it.
 * Only executing the query can.
 */
describe("push receipts — the queries actually execute", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("pushHealth runs on an empty table", async () => {
    const h = await pushHealth(30);
    expect(h.attempted).toBe(0);
    expect(h.delivered).toBe(0);
    expect(h.opened).toBe(0);
  });

  it("pushHealth runs for all-time (null window)", async () => {
    const h = await pushHealth(null);
    expect(h.attempted).toBe(0);
  });

  it("pushHealth counts landed and opened separately from attempted", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "r1@example.com", role: "subject" })
      .returning();
    const [d] = await db
      .insert(devices)
      .values({ userId: u!.id, platform: "ios" })
      .returning();
    const [n] = await db
      .insert(notifications)
      .values({
        title: "t",
        audience: { type: "all" },
        sentAt: new Date(),
      })
      .returning();

    await db.insert(notificationDeliveries).values([
      // Accepted by the push service, never seen on a device.
      {
        notificationId: n!.id,
        userId: u!.id,
        deviceId: d!.id,
        status: "sent" as const,
      },
    ]);
    let h = await pushHealth(30);
    expect(h.attempted).toBe(1);
    expect(h.delivered).toBe(0);

    // Now the service worker reports it drawn, then tapped.
    await db
      .update(notificationDeliveries)
      .set({ deliveredAt: new Date(), openedAt: new Date() });
    h = await pushHealth(30);
    expect(h.delivered).toBe(1);
    expect(h.opened).toBe(1);
  });

  it("subjectReach and subjectNotifications run", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "r2@example.com", role: "subject" })
      .returning();
    const reach = await subjectReach(u!.id);
    expect(reach.devices).toBe(0);
    expect(reach.pushEnabled).toBe(0);
    expect(await subjectNotifications(u!.id)).toEqual([]);
  });

  it("reachFor short-circuits on an empty list and runs on a real one", async () => {
    expect((await reachFor([])).size).toBe(0);
    expect(
      (await reachFor(["00000000-0000-0000-0000-000000000000"])).size,
    ).toBe(0);
  });
});
