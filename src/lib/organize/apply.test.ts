import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  playlistItems,
  playlists,
  reviewQueue,
  trackTags,
  trackTriggers,
  tracks,
  users,
} from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { applyReview } from "./apply";
import type { OrganizeProposal } from "./types";

async function makeTrack(): Promise<string> {
  const [t] = await db
    .insert(tracks)
    .values({ title: "Descent", slug: `d-${Math.random().toString(36).slice(2, 8)}` })
    .returning();
  return t!.id;
}
async function makeGoddess(): Promise<string> {
  const [u] = await db.insert(users).values({ role: "goddess" }).returning();
  return u!.id;
}
async function makeReview(
  trackId: string,
  proposal: OrganizeProposal,
): Promise<string> {
  const [r] = await db
    .insert(reviewQueue)
    .values({
      kind: "tags",
      subjectRef: { trackId, title: "Descent" },
      proposal,
      status: "pending",
    })
    .returning();
  return r!.id;
}

beforeEach(async () => {
  await truncateAll();
});

describe("applyReview", () => {
  it("creates tags, triggers, and playlist placement, then marks approved", async () => {
    const trackId = await makeTrack();
    const actor = await makeGoddess();
    const reviewId = await makeReview(trackId, {
      tags: [
        { kind: "theme", value: "chastity" },
        { kind: "purpose", value: "conditioning" },
      ],
      triggers: [
        {
          name: "The Clicker",
          relation: "installs",
          evidence: [{ start: 10, end: 14, phrase: "the clicker" }],
        },
      ],
      playlists: [{ target: "30 Days Chastity", reason: "title" }],
    });

    await applyReview(reviewId, actor);

    const appliedTags = await db
      .select()
      .from(trackTags)
      .where(eq(trackTags.trackId, trackId));
    expect(appliedTags).toHaveLength(2);
    expect(appliedTags[0]?.source).toBe("agent");

    const appliedTrigs = await db
      .select()
      .from(trackTriggers)
      .where(eq(trackTriggers.trackId, trackId));
    expect(appliedTrigs).toHaveLength(1);
    expect(appliedTrigs[0]?.relation).toBe("installs");

    const pls = await db
      .select()
      .from(playlists)
      .where(eq(playlists.title, "30 Days Chastity"));
    expect(pls).toHaveLength(1);
    const items = await db
      .select()
      .from(playlistItems)
      .where(eq(playlistItems.trackId, trackId));
    expect(items).toHaveLength(1);

    const [review] = await db
      .select()
      .from(reviewQueue)
      .where(eq(reviewQueue.id, reviewId));
    expect(review?.status).toBe("approved");
  });

  it("is idempotent — re-applying does not duplicate", async () => {
    const trackId = await makeTrack();
    const actor = await makeGoddess();
    const proposal: OrganizeProposal = {
      tags: [{ kind: "theme", value: "devotion" }],
      triggers: [],
      playlists: [{ target: "Devotion", reason: "" }],
    };
    const r1 = await makeReview(trackId, proposal);
    await applyReview(r1, actor);
    const r2 = await makeReview(trackId, proposal);
    await applyReview(r2, actor);

    const appliedTags = await db
      .select()
      .from(trackTags)
      .where(eq(trackTags.trackId, trackId));
    expect(appliedTags).toHaveLength(1);
    const items = await db
      .select()
      .from(playlistItems)
      .where(eq(playlistItems.trackId, trackId));
    expect(items).toHaveLength(1);
  });
});
