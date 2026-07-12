import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, grants, tracks, users } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { setSetting } from "@/lib/settings";
import { deliverCommission, submitCommission } from "./ops";
import { getAccessibleTrack } from "@/lib/library/queries";

async function makeSubject(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "subject" }).returning();
  return u!.id;
}
async function makeGoddess(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "goddess" }).returning();
  return u!.id;
}
async function makeDraftTrack(): Promise<string> {
  const [t] = await db
    .insert(tracks)
    .values({
      title: "For you only",
      slug: `foryou-${Math.random().toString(36).slice(2, 8)}`,
      streamKey: "stream/x.m4a",
      minAccessLevel: 99,
      visibility: "draft",
    })
    .returning();
  return t!.id;
}

beforeEach(async () => {
  await truncateAll();
  await makeGoddess(); // notifyGoddess has a recipient
});

describe("commissions", () => {
  it("submits open vs waitlist based on the toggle", async () => {
    const uid = await makeSubject();
    await setSetting("commissions_open", true);
    const a = await submitCommission(uid, { scenario: "x" });
    expect(a.waitlisted).toBe(false);

    await setSetting("commissions_open", false);
    const b = await submitCommission(uid, { scenario: "y" });
    expect(b.waitlisted).toBe(true);

    const rows = await db
      .select()
      .from(commissions)
      .where(eq(commissions.userId, uid));
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.waitlist)).toBe(true);
  });

  it("delivering a private track grants it — visible only to the commissioner", async () => {
    const uid = await makeSubject();
    const other = await makeSubject();
    const goddess = await makeGoddess();
    await setSetting("commissions_open", true);
    await submitCommission(uid, { scenario: "custom" });
    const [c] = await db
      .select()
      .from(commissions)
      .where(eq(commissions.userId, uid));
    const trackId = await makeDraftTrack();

    await deliverCommission(c!.id, trackId, goddess);

    // Grant exists for the commissioner.
    const g = await db.select().from(grants).where(eq(grants.userId, uid));
    expect(g).toHaveLength(1);

    // Commissioner can access the private track; another subject cannot.
    expect(await getAccessibleTrack(trackId, uid, 0)).not.toBeNull();
    expect(await getAccessibleTrack(trackId, other, 0)).toBeNull();

    const [updated] = await db
      .select()
      .from(commissions)
      .where(eq(commissions.id, c!.id));
    expect(updated?.status).toBe("delivered");
  });
});
