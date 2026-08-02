import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { commissions, users, wishes } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import {
  addNote,
  dossierBrief,
  notesFor,
  subjectDossier,
  toggleNotePinned,
} from "./dossier";

async function makeSubject(name = "Marc"): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ role: "subject", chosenName: name, honorific: "Goddess" })
    .returning();
  return u!.id;
}

beforeEach(async () => {
  await truncateAll();
});

describe("her file on one person — what every proposed reply reads", () => {
  it("holds what she writes down, newest first, held notes above the rest", async () => {
    const A = await makeSubject();
    // The OLDEST note is the held one — the whole point of holding is that age
    // stops burying what matters.
    await addNote(A, "Gave the most after being told he'd been patient.", true);
    await addNote(A, "Works nights. Never message him before 9pm his time.");
    await addNote(A, "Broke up with someone in March. Do not mention it first.");

    const notes = await notesFor(A);
    expect(notes).toHaveLength(3);
    expect(notes[0]!.pinned).toBe(true);
    expect(notes[0]!.body).toContain("patient");
    // Then the rest, newest first.
    expect(notes[1]!.body).toContain("Broke up");

    // Releasing it drops it back into the timeline, where its age puts it last.
    await toggleNotePinned(notes[0]!.id);
    const after = await notesFor(A);
    expect(after[0]!.body).toContain("Broke up");
    expect(after[2]!.body).toContain("patient");
  });

  it("gathers everything an answer has to sit on, and puts her notes above the counters", async () => {
    const A = await makeSubject("Sten");
    await db.insert(wishes).values({
      userId: A,
      title: "A file about being kept waiting",
      body: "I want to be made to wait for you.",
    });
    await db.insert(commissions).values({
      userId: A,
      answers: { what: "something only mine" },
    });
    await addNote(A, "Pays right after she withholds. Never when she gives.", true);

    const d = await subjectDossier(A);
    expect(d).not.toBeNull();
    expect(d!.name).toBe("Sten");
    expect(d!.commissioned.count).toBe(1);
    expect(d!.asked[0]!.body).toContain("made to wait");
    expect(d!.notes[0]!.pinned).toBe(true);

    const brief = dossierBrief(d!);
    // The money signal is stated, not left for the model to infer.
    expect(brief).toContain("HAS PAID EXTRA");
    // Her own words are marked as outranking everything the app measured.
    expect(brief).toContain("trust these over everything above");
    expect(brief).toContain("Pays right after she withholds");
    // What he asked for, verbatim — the thing that makes a reply his.
    expect(brief).toContain("made to wait");
  });

  it("says plainly when he has never listened, instead of leaving a silent gap", async () => {
    const A = await makeSubject();
    const brief = dossierBrief((await subjectDossier(A))!);
    expect(brief).toContain("never listened");
    expect(brief).toContain("Never commissioned");
  });
});
