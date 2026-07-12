import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chainEvents, chains, users } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { keepChain } from "./keep";
import { localDate, previousDay } from "./logic";

async function makeSubject(): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ role: "subject", timezone: "UTC" })
    .returning();
  return u!.id;
}

beforeEach(async () => {
  await truncateAll();
});

describe("keepChain", () => {
  it("first keep starts the chain at 1", async () => {
    const uid = await makeSubject();
    const r = await keepChain(uid, "listen");
    expect(r.currentLen).toBe(1);
    expect(r.kept).toBe(true);
  });

  it("keeping twice the same day is idempotent", async () => {
    const uid = await makeSubject();
    await keepChain(uid, "listen");
    const r2 = await keepChain(uid, "mantra");
    expect(r2.kept).toBe(false);
    expect(r2.currentLen).toBe(1);
  });

  it("a consecutive day extends the chain to 2", async () => {
    const uid = await makeSubject();
    await keepChain(uid, "listen"); // today
    // Simulate that keep having happened yesterday instead.
    const today = localDate(new Date(), "UTC");
    const yesterday = previousDay(today);
    await db
      .update(chains)
      .set({ lastKeptDate: yesterday })
      .where(eq(chains.userId, uid));
    await db.delete(chainEvents).where(eq(chainEvents.userId, uid));

    const r = await keepChain(uid, "listen");
    expect(r.currentLen).toBe(2);
  });
});
