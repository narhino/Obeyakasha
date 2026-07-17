"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { broadcast } from "@/lib/push/broadcast";
import { closePoll, createPollRecord, pollResults } from "@/lib/polls/ops";

const createSchema = z.object({
  question: z.string().min(1).max(200),
  options: z.string().min(1), // newline-separated
  audienceType: z.enum(["all", "level"]),
  level: z.coerce.number().int().min(0).max(99).optional(),
  anonymous: z.union([z.literal("on"), z.null()]).optional(),
});

export async function createPoll(formData: FormData) {
  const session = await requireGoddess();
  const parsed = createSchema.safeParse({
    question: formData.get("question"),
    options: formData.get("options"),
    audienceType: formData.get("audienceType"),
    level: formData.get("level") || undefined,
    anonymous: formData.get("anonymous"),
  });
  if (!parsed.success) throw new Error("Invalid poll");
  const d = parsed.data;

  const options = d.options
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((label, i) => ({ id: `o${i + 1}`, label }));
  if (options.length < 2) throw new Error("Need at least 2 options");

  const audience: Audience =
    d.audienceType === "all"
      ? { type: "all" }
      : { type: "level", level: d.level ?? 1 };

  await createPollRecord({
    question: d.question,
    options,
    audience,
    anonymousToAdmin: d.anonymous === "on",
  });

  await broadcast({
    title: "She's asking. Answer.",
    body: d.question,
    deepLink: "/asks",
    audience,
    kind: "manual",
    createdBy: session.user.id,
  });
  await logAudit(session.user.id, "poll.created", { question: d.question });
  revalidatePath("/sanctum/polls");
}

export async function closePollAction(formData: FormData) {
  const session = await requireGoddess();
  const pollId = String(formData.get("pollId"));
  await closePoll(pollId);
  await logAudit(session.user.id, "poll.closed", { pollId });
  revalidatePath("/sanctum/polls");
}

export async function shareResultsAction(formData: FormData) {
  const session = await requireGoddess();
  const pollId = String(formData.get("pollId"));
  const [poll] = await db.select().from(polls).where(eq(polls.id, pollId)).limit(1);
  if (!poll) throw new Error("No poll");
  const results = await pollResults(pollId);
  if (!results) throw new Error("No results");
  const winner = results.results.find((r) => r.optionId === results.winnerId);

  const body = `${poll.question} — you chose "${winner?.label ?? "…"}" (${winner?.pct ?? 0}%).`;
  await db.insert(whispers).values({
    body,
    audience: poll.audience,
    publishedAt: new Date(),
  });
  await broadcast({
    title: "You chose together.",
    body,
    deepLink: "/",
    audience: poll.audience as Audience,
    kind: "manual",
    createdBy: session.user.id,
  });
  await db.update(polls).set({ resultsShared: true }).where(eq(polls.id, pollId));
  await logAudit(session.user.id, "poll.results_shared", { pollId });
  revalidatePath("/sanctum/polls");
}
