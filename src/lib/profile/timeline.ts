import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  dropReports,
  listenSessions,
  questionAnswers,
  questions,
  tracks,
  wishes,
} from "@/lib/db/schema";

export interface TimelineEvent {
  at: Date;
  kind: "answer" | "listen" | "drop" | "wish";
  text: string;
}

/** A merged, recent activity timeline for a subject's profile (A1). */
export async function profileTimeline(
  userId: string,
  limit = 40,
): Promise<TimelineEvent[]> {
  const [answers, listens, drops, wishRows] = await Promise.all([
    db
      .select({
        at: questionAnswers.createdAt,
        prompt: questions.prompt,
        answer: questionAnswers.answer,
      })
      .from(questionAnswers)
      .innerJoin(questions, eq(questions.id, questionAnswers.questionId))
      .where(eq(questionAnswers.userId, userId))
      .orderBy(desc(questionAnswers.createdAt))
      .limit(20),
    db
      .select({
        at: listenSessions.endedAt,
        title: tracks.title,
        completed: listenSessions.completed,
      })
      .from(listenSessions)
      .innerJoin(tracks, eq(tracks.id, listenSessions.trackId))
      .where(eq(listenSessions.userId, userId))
      .orderBy(desc(listenSessions.startedAt))
      .limit(20),
    db
      .select({
        at: dropReports.createdAt,
        depth: dropReports.depth,
        note: dropReports.note,
        title: tracks.title,
      })
      .from(dropReports)
      .innerJoin(tracks, eq(tracks.id, dropReports.trackId))
      .where(eq(dropReports.userId, userId))
      .orderBy(desc(dropReports.createdAt))
      .limit(20),
    db
      .select({ at: wishes.createdAt, body: wishes.body })
      .from(wishes)
      .where(eq(wishes.userId, userId))
      .orderBy(desc(wishes.createdAt))
      .limit(20),
  ]);

  const events: TimelineEvent[] = [];
  for (const a of answers)
    if (a.at) events.push({ at: a.at, kind: "answer", text: `${a.prompt} — "${a.answer}"` });
  for (const l of listens)
    if (l.at)
      events.push({
        at: l.at,
        kind: "listen",
        text: `${l.completed ? "Completed" : "Listened to"} ${l.title}`,
      });
  for (const d of drops)
    if (d.at)
      events.push({
        at: d.at,
        kind: "drop",
        text: `Dropped ${d.depth}/5 on ${d.title}${d.note ? ` — "${d.note}"` : ""}`,
      });
  for (const w of wishRows)
    if (w.at) events.push({ at: w.at, kind: "wish", text: `Wished: ${w.body}` });

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}
