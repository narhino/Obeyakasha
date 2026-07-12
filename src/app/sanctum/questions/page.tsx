import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { questionAnswers, questions, users } from "@/lib/db/schema";
import { Button, Card, Display, Input, Select, Whisper } from "@/components/ui";
import { createQuestion } from "./actions";

export default async function SanctumQuestions() {
  const ritual = await db
    .select()
    .from(questions)
    .where(eq(questions.kind, "ritual"))
    .orderBy(desc(questions.createdAt))
    .limit(20);

  const answers = ritual.length
    ? await db
        .select({
          questionId: questionAnswers.questionId,
          answer: questionAnswers.answer,
          name: users.chosenName,
          createdAt: questionAnswers.createdAt,
        })
        .from(questionAnswers)
        .innerJoin(users, eq(users.id, questionAnswers.userId))
        .orderBy(desc(questionAnswers.createdAt))
        .limit(200)
    : [];

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Questions</Display>
      <Whisper className="mt-1">
        Ask them something. Their answers land on their profiles.
      </Whisper>

      <Card className="mt-6">
        <form action={createQuestion} className="space-y-3">
          <Input
            name="prompt"
            required
            placeholder="What do you crave that you've never told me?"
            className="w-full"
          />
          <div className="flex items-center gap-3">
            <Select name="audienceType" defaultValue="all">
              <option value="all">Everyone</option>
              <option value="level">Access level ≥</option>
            </Select>
            <Input name="level" type="number" min={0} max={99} defaultValue={1} className="w-24" />
          </div>
          <Button type="submit" variant="gold">
            Ask
          </Button>
        </form>
      </Card>

      <div className="mt-8 space-y-4">
        {ritual.map((q) => {
          const qa = answers.filter((a) => a.questionId === q.id);
          return (
            <Card key={q.id} raised>
              <p className="font-[family-name:var(--font-display)] text-lg">
                {q.prompt}
              </p>
              <Whisper className="text-xs">{qa.length} answered</Whisper>
              <ul className="mt-2 space-y-1">
                {qa.slice(0, 10).map((a, i) => (
                  <li key={i} className="text-sm text-text">
                    <span className="text-gold">{a.name ?? "someone"}:</span>{" "}
                    {a.answer}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
