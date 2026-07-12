import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, users, voiceCorpus } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { setSetting } from "@/lib/settings";
import {
  getOrCreateThread,
  inboxThreads,
  sendGoddessMessage,
  sendSubjectMessage,
} from "./ops";

async function makeSubject(): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ role: "subject", chosenName: "Marc" })
    .returning();
  return u!.id;
}

beforeEach(async () => {
  await truncateAll();
  await setSetting("msg_daily_limit", 3);
});

describe("messages", () => {
  it("subject message creates a thread; goddess reply marks read + trains corpus", async () => {
    const uid = await makeSubject();
    const r = await sendSubjectMessage(uid, "Goddess, I need you.");
    expect(r.ok).toBe(true);

    const threadId = await getOrCreateThread(uid);
    await sendGoddessMessage(threadId, "I know. Kneel.");

    const all = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId));
    expect(all).toHaveLength(2);
    const subjMsg = all.find((m) => m.sender === "subject");
    expect(subjMsg?.readAt).not.toBeNull();

    const corpus = await db.select().from(voiceCorpus);
    expect(corpus.some((c) => c.text === "I know. Kneel.")).toBe(true);
  });

  it("enforces the daily message limit", async () => {
    const uid = await makeSubject();
    await sendSubjectMessage(uid, "one");
    await sendSubjectMessage(uid, "two");
    await sendSubjectMessage(uid, "three");
    const r = await sendSubjectMessage(uid, "four");
    expect(r.ok).toBe(false);
  });

  it("flags a distress message for safety", async () => {
    const uid = await makeSubject();
    await sendSubjectMessage(uid, "i feel unsafe and scared");
    const threadId = await getOrCreateThread(uid);
    const [m] = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId));
    expect(m?.flaggedSafety).toBe(true);
  });

  it("inbox sorts flagged threads first", async () => {
    const calm = await makeSubject();
    const flagged = await makeSubject();
    await sendSubjectMessage(calm, "thank you Goddess");
    await sendSubjectMessage(flagged, "i want to kill myself");
    const inbox = await inboxThreads();
    expect(inbox[0]?.userId).toBe(flagged);
    expect(inbox[0]?.flagged).toBe(true);
  });
});
