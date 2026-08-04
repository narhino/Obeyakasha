import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { messages, threads, users, whisperComments, whispers, wishes } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { truncateAll } from "@/lib/test/db";
import { addNote } from "@/lib/profile/dossier";
import { subjectFile } from "./corpus";

beforeEach(async () => {
  await truncateAll();
});

describe("the member corpus — what actually leaves the server", () => {
  it("carries everything he ever said into one readable file", async () => {
    const [u] = await db
      .insert(users)
      .values({ role: "subject", chosenName: "Marc", email: "marc@example.com" })
      .returning();
    const A = u!.id;

    const [t] = await db.insert(threads).values({ userId: A }).returning();
    await db.insert(messages).values([
      { threadId: t!.id, sender: "subject", body: "I broke the chain last night." },
      { threadId: t!.id, sender: "goddess", body: "Then you begin again tonight." },
    ]);
    await db.insert(wishes).values({
      userId: A,
      title: "Something about waiting",
      body: "I want to be made to wait.",
    });
    const [w] = await db
      .insert(whispers)
      .values({ body: "Kneel.", audience: { type: "public" } as Audience, publishedAt: new Date() })
      .returning();
    await db.insert(whisperComments).values({
      whisperId: w!.id,
      userId: A,
      body: "I read this eleven times.",
    });
    await addNote(A, "Gives most right after she withholds.", true);

    const file = (await subjectFile(A, { contacts: false }))!;
    expect(file.name).toBe(`subjects/marc-${A.slice(0, 8)}.md`);

    // Every source he wrote into is present, verbatim.
    expect(file.markdown).toContain("I broke the chain last night.");
    expect(file.markdown).toContain("Then you begin again tonight.");
    expect(file.markdown).toContain("I want to be made to wait.");
    expect(file.markdown).toContain("I read this eleven times.");
    expect(file.markdown).toContain("Gives most right after she withholds.");

    // Contacts are OFF by default — this archive leaves the server.
    expect(file.markdown).not.toContain("marc@example.com");
    expect(JSON.stringify(file.record)).not.toContain("marc@example.com");

    // And ON only when she asks.
    const withEmail = (await subjectFile(A, { contacts: true }))!;
    expect(withEmail.markdown).toContain("marc@example.com");
  });

  it("cannot have its markdown broken by a member's own text", async () => {
    const [u] = await db
      .insert(users)
      .values({ role: "subject", chosenName: "Sten" })
      .returning();
    await addNote(u!.id, "He pasted ```rm -rf``` at me to see what I'd do.");
    const file = (await subjectFile(u!.id, { contacts: false }))!;
    expect(file.markdown).not.toContain("```");
  });
});
