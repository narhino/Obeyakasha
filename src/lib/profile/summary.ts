import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { questionAnswers, questions } from "@/lib/db/schema";
import { collarCard } from "./collar";

/** A short profile summary string for the AI reply drafter (F11). */
export async function profileSummary(userId: string): Promise<string> {
  const card = await collarCard(userId);
  const answers = await db
    .select({ prompt: questions.prompt, answer: questionAnswers.answer })
    .from(questionAnswers)
    .innerJoin(questions, eq(questions.id, questionAnswers.questionId))
    .where(eq(questionAnswers.userId, userId))
    .orderBy(desc(questionAnswers.createdAt))
    .limit(6);

  const parts: string[] = [];
  if (card) {
    parts.push(
      `${card.honorific ?? "Goddess"}'s ${card.chosenName ?? "subject"}, ` +
        `chain ${card.chain.currentLen}d, ${card.filesCompleted} files done, ` +
        `${card.listeningHours}h under, ${card.triggersHeld.length} triggers held.`,
    );
  }
  for (const a of answers) {
    if (a.answer) parts.push(`${a.prompt} — "${a.answer}"`);
  }
  return parts.join(" ").slice(0, 1200);
}
