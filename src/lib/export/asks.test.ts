import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { tracks, users, wishClusters, wishes } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { buildAsksDoc } from "./asks";

beforeEach(async () => {
  await truncateAll();
});

describe("the asks document — the brief for the next script", () => {
  it("carries every craving verbatim, her groups first, and what's already made", async () => {
    const [a] = await db
      .insert(users)
      .values({ role: "subject", chosenName: "Marc" })
      .returning();
    const [b] = await db
      .insert(users)
      .values({ role: "subject", chosenName: "Sten" })
      .returning();

    const [w1] = await db
      .insert(wishes)
      .values({
        userId: a!.id,
        title: "Made to wait",
        body: "I want to be kept on the edge and told to wait for you.",
      })
      .returning();
    const [w2] = await db
      .insert(wishes)
      .values({
        userId: b!.id,
        body: "Something where I am not allowed to finish until you say.",
        status: "planned",
      })
      .returning();
    await db.insert(wishClusters).values({
      label: "Denial / waiting",
      wishIds: [w1!.id, w2!.id],
    });
    await db.insert(tracks).values({
      title: "The Long Wait",
      slug: "the-long-wait",
      visibility: "published",
      publishedAt: new Date(),
    });

    const { markdown, count } = await buildAsksDoc();
    expect(count).toBe(2);

    // Their exact words — that's what the script gets written from.
    expect(markdown).toContain("kept on the edge and told to wait");
    expect(markdown).toContain("not allowed to finish until you say");
    // Her own grouping leads.
    expect(markdown).toContain("Denial / waiting");
    expect(markdown.indexOf("Denial / waiting")).toBeLessThan(
      markdown.indexOf("kept on the edge"),
    );
    // What she has already recorded, so a brief can't propose it again.
    expect(markdown).toContain("don't propose these again");
    expect(markdown).toContain("The Long Wait");
    // Counts she can act on.
    expect(markdown).toContain("Unanswered: **1**");
  });

  it("still works with no groups made, and can't be broken by their own text", async () => {
    const [a] = await db
      .insert(users)
      .values({ role: "subject", chosenName: "Ilan" })
      .returning();
    await db.insert(wishes).values({
      userId: a!.id,
      body: "```make me\nkneel```",
    });
    const { markdown } = await buildAsksDoc();
    expect(markdown).toContain("Every ask");
    expect(markdown).not.toContain("```");
  });
});
