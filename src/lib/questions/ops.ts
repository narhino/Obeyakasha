import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { questionAnswers, questions } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { audienceMatches } from "@/lib/push/audience";

/** Ritual questions this subject hasn't answered yet (F10). */
export async function pendingQuestions(
  userId: string,
  userLevel: number,
): Promise<{ id: string; prompt: string }[]> {
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.kind, "ritual"))
    .orderBy(desc(questions.createdAt))
    .limit(100);
  const matched = rows.filter(
    (q) => !q.audience || audienceMatches(q.audience as Audience, userLevel, userId),
  );
  if (matched.length === 0) return [];

  const answered = await db
    .select({ questionId: questionAnswers.questionId })
    .from(questionAnswers)
    .where(
      and(
        eq(questionAnswers.userId, userId),
        inArray(
          questionAnswers.questionId,
          matched.map((m) => m.id),
        ),
      ),
    );
  const answeredSet = new Set(answered.map((a) => a.questionId));
  return matched
    .filter((q) => !answeredSet.has(q.id))
    .map((q) => ({ id: q.id, prompt: q.prompt }));
}

export async function answerQuestion(
  userId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  await db.insert(questionAnswers).values({ questionId, userId, answer });
}
