import type { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import {
  consents,
  questionAnswers,
  questions,
  users,
  wishes,
} from "@/lib/db/schema";

const schema = z.object({
  chosenName: z.string().min(1).max(80),
  honorific: z.string().max(40).optional(),
  pronouns: z.string().max(40).optional(),
  sinceWhen: z.string().max(300).optional(),
  seek: z.string().max(1000).optional(),
  favorites: z.string().max(1000).optional(),
  wish: z.string().max(1000).optional(),
  optouts: z.array(z.string().max(60)).max(50).optional(),
});

/** Ensure a fixed intake question exists (by prompt) and return its id. */
async function intakeQuestionId(prompt: string): Promise<string> {
  const [existing] = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.prompt, prompt), eq(questions.kind, "intake")))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(questions)
    .values({ prompt, kind: "intake" })
    .returning();
  return created!.id;
}

async function recordAnswer(userId: string, prompt: string, answer?: string) {
  if (!answer || !answer.trim()) return;
  const questionId = await intakeQuestionId(prompt);
  await db.insert(questionAnswers).values({ questionId, userId, answer });
}

/** Initiation intake (F9). Sets identity + records the narrative answers. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const d = parsed.data;
  return withSubject(async (userId) => {
    await db
      .update(users)
      .set({
        chosenName: d.chosenName,
        honorific: d.honorific,
        pronouns: d.pronouns,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await recordAnswer(userId, "How long have you belonged to my voice?", d.sinceWhen);
    await recordAnswer(userId, "What do you come here for?", d.seek);
    await recordAnswer(userId, "Which of my files marked you the deepest?", d.favorites);

    if (d.wish && d.wish.trim()) {
      await db
        .insert(wishes)
        .values({ userId, body: d.wish, source: "intake" });
    }
    if (d.optouts && d.optouts.length > 0) {
      await db
        .insert(consents)
        .values({ userId, kind: "theme_optout", payload: { themes: d.optouts } });
    }
    return { ok: true };
  });
}
