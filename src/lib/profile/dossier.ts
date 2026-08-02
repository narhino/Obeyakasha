import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commissions,
  listenSessions,
  questionAnswers,
  questions,
  subjectNotes,
  tracks,
  users,
  wishes,
} from "@/lib/db/schema";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { collarCard } from "./collar";

/**
 * Everything worth knowing about ONE person, gathered in one read, for the
 * reply drafter (F11).
 *
 * The old drafter got a one-line summary and the last ten messages. That is not
 * enough to answer a person — it produces replies that could go to anybody,
 * which is exactly what makes them feel like nothing. This assembles the things
 * an answer has to sit on: what he calls himself, what he has actually given
 * (money, hours, obedience), what he asked her for in his own words, where he
 * stands right now, whether he is drifting — and her own notes on him, first.
 *
 * Read-only, goddess-side only. Never returned to a subject.
 */

export interface SubjectNote {
  id: string;
  body: string;
  pinned: boolean;
  createdAt: Date;
}

export interface Dossier {
  name: string;
  honorific: string | null;
  collared: boolean;
  /** How long they've been hers, in days. */
  knownForDays: number;
  standing: {
    level: number;
    frozen: boolean;
    inGrace: boolean;
  };
  investment: {
    chainNow: number;
    chainBest: number;
    filesCompleted: number;
    listeningHours: number;
    triggers: string[];
  };
  /** Money already given beyond the pledge — the strongest signal there is. */
  commissioned: { count: number; last: Date | null };
  /** What he has asked her for, in his own words. */
  asked: { title: string | null; body: string; at: Date }[];
  /** His answers to her ritual questions — the most honest thing he's written. */
  said: { prompt: string; answer: string }[];
  rhythm: {
    lastListenAt: Date | null;
    lastFile: string | null;
    /** Days since he last put her in his ears. Null if he never has. */
    daysSinceListen: number | null;
  };
  notes: SubjectNote[];
}

function daysBetween(then: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

export async function subjectDossier(userId: string): Promise<Dossier | null> {
  const [user] = await db
    .select({
      chosenName: users.chosenName,
      honorific: users.honorific,
      oathAt: users.oathAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [card, access, notes, commissionRows, wishRows, answers, lastListen] =
    await Promise.all([
      collarCard(userId),
      resolveAccess(userId),
      db
        .select()
        .from(subjectNotes)
        .where(eq(subjectNotes.userId, userId))
        .orderBy(desc(subjectNotes.pinned), desc(subjectNotes.createdAt))
        .limit(30),
      db
        .select({ createdAt: commissions.createdAt })
        .from(commissions)
        .where(eq(commissions.userId, userId))
        .orderBy(desc(commissions.createdAt))
        .limit(20),
      db
        .select({
          title: wishes.title,
          body: wishes.body,
          createdAt: wishes.createdAt,
        })
        .from(wishes)
        .where(eq(wishes.userId, userId))
        .orderBy(desc(wishes.createdAt))
        .limit(6),
      db
        .select({ prompt: questions.prompt, answer: questionAnswers.answer })
        .from(questionAnswers)
        .innerJoin(questions, eq(questions.id, questionAnswers.questionId))
        .where(eq(questionAnswers.userId, userId))
        .orderBy(desc(questionAnswers.createdAt))
        .limit(10),
      db
        .select({ at: listenSessions.startedAt, title: tracks.title })
        .from(listenSessions)
        .innerJoin(tracks, eq(tracks.id, listenSessions.trackId))
        .where(eq(listenSessions.userId, userId))
        .orderBy(desc(listenSessions.startedAt))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

  return {
    name: user.chosenName ?? "your subject",
    honorific: user.honorific,
    collared: Boolean(user.oathAt),
    knownForDays: daysBetween(user.createdAt),
    standing: {
      level: access.accessLevel,
      frozen: access.frozen,
      inGrace: access.inGrace,
    },
    investment: {
      chainNow: card?.chain.currentLen ?? 0,
      chainBest: card?.chain.bestLen ?? 0,
      filesCompleted: card?.filesCompleted ?? 0,
      listeningHours: card?.listeningHours ?? 0,
      triggers: (card?.triggersHeld ?? []).map((t) => t.name),
    },
    commissioned: {
      count: commissionRows.length,
      last: commissionRows[0]?.createdAt ?? null,
    },
    asked: wishRows.map((w) => ({
      title: w.title,
      body: w.body,
      at: w.createdAt,
    })),
    said: answers
      .filter((a): a is { prompt: string; answer: string } => Boolean(a.answer))
      .map((a) => ({ prompt: a.prompt, answer: a.answer })),
    rhythm: {
      lastListenAt: lastListen?.at ?? null,
      lastFile: lastListen?.title ?? null,
      daysSinceListen: lastListen?.at ? daysBetween(lastListen.at) : null,
    },
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      pinned: n.pinned,
      createdAt: n.createdAt,
    })),
  };
}

/**
 * The dossier as the drafter reads it: dense, factual, no adjectives. Written
 * as plain lines rather than JSON because the model answers a person better
 * when it reads notes than when it parses a record.
 */
export function dossierBrief(d: Dossier): string {
  const lines: string[] = [];
  lines.push(
    `WHO: ${d.name}${d.honorific ? ` (calls her ${d.honorific})` : ""}. ` +
      `${d.collared ? "Collared — inner circle." : "Not collared."} ` +
      `Hers for ${d.knownForDays} days.`,
  );
  lines.push(
    `STANDING: level ${d.standing.level}` +
      (d.standing.frozen
        ? " — FROZEN, his pledge stopped. He can still read and write to her but the library is sealed."
        : d.standing.inGrace
          ? " — in grace, his payment failed and is about to lapse."
          : " — current."),
  );
  lines.push(
    `GIVEN: ${d.investment.listeningHours}h under, ${d.investment.filesCompleted} files finished, ` +
      `chain ${d.investment.chainNow} days now (best ${d.investment.chainBest}), ` +
      `${d.investment.triggers.length} triggers held` +
      (d.investment.triggers.length
        ? ` (${d.investment.triggers.slice(0, 8).join(", ")})`
        : "") +
      `. ${
        d.commissioned.count > 0
          ? `HAS PAID EXTRA — ${d.commissioned.count} commission${d.commissioned.count === 1 ? "" : "s"} ordered.`
          : "Never commissioned anything."
      }`,
  );
  if (d.rhythm.daysSinceListen !== null) {
    lines.push(
      `RHYTHM: last listened ${d.rhythm.daysSinceListen} day(s) ago` +
        (d.rhythm.lastFile ? ` — "${d.rhythm.lastFile}"` : "") +
        (d.rhythm.daysSinceListen > 7 ? ". He is drifting." : "."),
    );
  } else {
    lines.push("RHYTHM: has never listened to anything. He is here for HER, not the files.");
  }
  for (const a of d.asked.slice(0, 4)) {
    lines.push(`HE ASKED FOR: ${a.title ? `${a.title} — ` : ""}${a.body}`.slice(0, 400));
  }
  for (const s of d.said.slice(0, 6)) {
    lines.push(`HE SAID (${s.prompt}): "${s.answer}"`.slice(0, 400));
  }
  if (d.notes.length) {
    lines.push("HER OWN NOTES ON HIM — trust these over everything above:");
    for (const n of d.notes.slice(0, 12)) {
      lines.push(`  ${n.pinned ? "★ " : "- "}${n.body}`.slice(0, 500));
    }
  }
  return lines.join("\n");
}

/** Add a note to her file on someone. */
export async function addNote(
  userId: string,
  body: string,
  pinned = false,
): Promise<void> {
  const text = body.trim();
  if (!text) return;
  await db.insert(subjectNotes).values({ userId, body: text.slice(0, 2000), pinned });
}

export async function deleteNote(noteId: string): Promise<string | null> {
  const [gone] = await db
    .delete(subjectNotes)
    .where(eq(subjectNotes.id, noteId))
    .returning({ userId: subjectNotes.userId });
  return gone?.userId ?? null;
}

export async function toggleNotePinned(noteId: string): Promise<string | null> {
  const [row] = await db
    .update(subjectNotes)
    .set({ pinned: sql`not ${subjectNotes.pinned}` })
    .where(eq(subjectNotes.id, noteId))
    .returning({ userId: subjectNotes.userId });
  return row?.userId ?? null;
}

/** Her notes for one person, held ones first. Used by the profile page. */
export async function notesFor(userId: string): Promise<SubjectNote[]> {
  const rows = await db
    .select()
    .from(subjectNotes)
    .where(eq(subjectNotes.userId, userId))
    .orderBy(desc(subjectNotes.pinned), desc(subjectNotes.createdAt));
  return rows.map((n) => ({
    id: n.id,
    body: n.body,
    pinned: n.pinned,
    createdAt: n.createdAt,
  }));
}
