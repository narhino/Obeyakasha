import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  messages,
  questionAnswers,
  questions,
  threads,
  users,
  whisperComments,
  wishes,
} from "@/lib/db/schema";
import { subjectDossier, type Dossier } from "@/lib/profile/dossier";
import { makeZip, slugForFile, type ZipEntry } from "./zip";

/**
 * The whole membership, as a folder an AI can read (F1).
 *
 * She asked how to get everything she's gathered out in a form something else
 * can work on. The answer is not a database dump — that carries secrets, needs
 * a schema in your head, and no model will read it well. It is one MARKDOWN
 * FILE PER PERSON, written the way a case file reads, plus a JSONL of the same
 * material for anything programmatic, plus a README that tells the model what
 * it's holding.
 *
 * Contact details (email, Patreon id) are OFF by default. A profiling model
 * does not need them, and this archive is going to leave the server — probably
 * into someone else's tool. She can turn them on when she needs them.
 */

export interface ExportOptions {
  /** Include email addresses. Off by default — see above. */
  contacts: boolean;
}

function fence(s: string): string {
  // Guard against a member's own text closing a block and eating the file.
  return s.replace(/```/g, "'''");
}

function when(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

/** Everything one person has said and done, as one readable document. */
export async function subjectFile(
  userId: string,
  opts: ExportOptions,
): Promise<{ name: string; markdown: string; record: Record<string, unknown> } | null> {
  const d: Dossier | null = await subjectDossier(userId);
  if (!d) return null;

  const [user] = await db
    .select({ email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [thread] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.userId, userId))
    .limit(1);

  const [msgs, comments, wishRows, answers] = await Promise.all([
    thread
      ? db
          .select({
            sender: messages.sender,
            body: messages.body,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(eq(messages.threadId, thread.id))
          .orderBy(asc(messages.createdAt))
      : Promise.resolve([]),
    db
      .select({ body: whisperComments.body, createdAt: whisperComments.createdAt })
      .from(whisperComments)
      .where(eq(whisperComments.userId, userId))
      .orderBy(desc(whisperComments.createdAt)),
    db
      .select({
        title: wishes.title,
        body: wishes.body,
        createdAt: wishes.createdAt,
      })
      .from(wishes)
      .where(eq(wishes.userId, userId))
      .orderBy(desc(wishes.createdAt)),
    db
      .select({ prompt: questions.prompt, answer: questionAnswers.answer })
      .from(questionAnswers)
      .innerJoin(questions, eq(questions.id, questionAnswers.questionId))
      .where(eq(questionAnswers.userId, userId))
      .orderBy(desc(questionAnswers.createdAt)),
  ]);

  const short = userId.slice(0, 8);
  const L: string[] = [];

  L.push(`# ${d.name}  \`${short}\``);
  L.push("");
  L.push(
    `- **Standing:** level ${d.standing.level}` +
      (d.standing.frozen
        ? " — frozen (pledge stopped)"
        : d.standing.inGrace
          ? " — in grace (payment failed)"
          : " — current"),
  );
  L.push(`- **Known for:** ${d.knownForDays} days${d.collared ? " · collared" : ""}`);
  L.push(
    `- **Given:** ${d.investment.listeningHours}h under · ` +
      `${d.investment.filesCompleted} files finished · ` +
      `chain ${d.investment.chainNow}d (best ${d.investment.chainBest})`,
  );
  if (d.investment.triggers.length)
    L.push(`- **Triggers held:** ${d.investment.triggers.join(", ")}`);
  L.push(
    `- **Paid beyond the pledge:** ${
      d.commissioned.count > 0
        ? `yes — ${d.commissioned.count} commission(s), last ${when(d.commissioned.last)}`
        : "never"
    }`,
  );
  L.push(
    `- **Last listened:** ${
      d.rhythm.daysSinceListen === null
        ? "never"
        : `${d.rhythm.daysSinceListen} days ago${d.rhythm.lastFile ? ` — "${d.rhythm.lastFile}"` : ""}`
    }`,
  );
  if (opts.contacts && user?.email) L.push(`- **Email:** ${user.email}`);
  L.push("");

  if (d.read) {
    L.push("## The read on him (written by the app's AI)");
    L.push("");
    L.push(fence(d.read.portrait));
    const bullets: [string, string[]][] = [
      ["Wants", d.read.wants],
      ["What works on him", d.read.respondsTo],
      ["Don't", d.read.avoid],
      ["Openings", d.read.openings],
    ];
    for (const [label, items] of bullets) {
      if (!items.length) continue;
      L.push("");
      L.push(`**${label}:**`);
      for (const i of items) L.push(`- ${fence(i)}`);
    }
    if (d.read.money) {
      L.push("");
      L.push(`**How he gives:** ${fence(d.read.money)}`);
    }
    if (d.read.risk) L.push(`**Risk:** ${fence(d.read.risk)}`);
    L.push("");
  }

  if (d.notes.length) {
    L.push("## Her own notes on him");
    L.push("");
    for (const n of d.notes) {
      L.push(`- ${n.pinned ? "**(held)** " : ""}${fence(n.body)}  _(${when(n.createdAt)})_`);
    }
    L.push("");
  }

  if (answers.length) {
    L.push("## His answers to her questions");
    L.push("");
    for (const a of answers) {
      if (!a.answer) continue;
      L.push(`**${fence(a.prompt)}**`);
      L.push("");
      L.push(`> ${fence(a.answer).replace(/\n/g, "\n> ")}`);
      L.push("");
    }
  }

  if (wishRows.length) {
    L.push("## What he asked her for");
    L.push("");
    for (const w of wishRows) {
      L.push(
        `- _(${when(w.createdAt)})_ ${w.title ? `**${fence(w.title)}** — ` : ""}${fence(w.body)}`,
      );
    }
    L.push("");
  }

  if (comments.length) {
    L.push("## What he wrote under her whispers");
    L.push("");
    L.push("_Unprompted, which is what makes these honest._");
    L.push("");
    for (const c of comments) {
      L.push(`- _(${when(c.createdAt)})_ ${fence(c.body)}`);
    }
    L.push("");
  }

  L.push("## Their whole conversation");
  L.push("");
  if (msgs.length === 0) {
    L.push("_They have never messaged each other._");
  } else {
    for (const m of msgs) {
      const who = m.sender === "goddess" ? "**AKASHA**" : "**HIM**";
      L.push(`${who} _(${when(m.createdAt)})_: ${fence(m.body ?? "")}`);
      L.push("");
    }
  }

  const markdown = L.join("\n");

  return {
    name: `subjects/${slugForFile(d.name)}-${short}.md`,
    markdown,
    record: {
      id: short,
      name: d.name,
      ...(opts.contacts && user?.email ? { email: user.email } : {}),
      collared: d.collared,
      knownForDays: d.knownForDays,
      standing: d.standing,
      investment: d.investment,
      commissioned: {
        count: d.commissioned.count,
        last: d.commissioned.last?.toISOString() ?? null,
      },
      daysSinceListen: d.rhythm.daysSinceListen,
      read: d.read,
      notes: d.notes.map((n) => ({ body: n.body, pinned: n.pinned })),
      answers: answers.filter((a) => a.answer),
      asked: wishRows,
      comments: comments.map((c) => c.body),
      conversation: msgs.map((m) => ({
        sender: m.sender,
        body: m.body,
        at: m.createdAt,
      })),
    },
  };
}

const README = (count: number, contacts: boolean) => `# Akasha — member corpus

${count} member file(s), exported from the Sanctum.

## What's in here

- \`subjects/*.md\` — one file per member. Standing, what they've given, her own
  notes, the app's read on them, their answers, what they asked for, what they
  wrote under her whispers, and their entire private conversation with her.
- \`all-subjects.jsonl\` — the same material, one JSON object per line, for
  anything that wants to process it programmatically.

${
  contacts
    ? "Email addresses ARE included in this export."
    : "Email addresses are NOT included — members are identified by chosen name and a short id."
}

## Handle carefully

Every line of this is a real person's private words to one person. It should
not be pasted anywhere it could be retained or trained on without that being a
decision you made deliberately.

## A prompt to start with

> You're reading the private member files of a hypnosis-audio creator. Each
> file is one member: their standing, what they've paid and listened to, what
> they've written to her, and her notes.
>
> Read all of them, then tell me:
> 1. Who is closest to leaving, and what specifically signals it in their words.
> 2. Who is most likely to give more than they currently do, and what would move
>    them — grounded in what they actually said, not in general upsell logic.
> 3. What themes come up across many members that I'm not addressing yet.
> 4. For each of the top 5 by investment, one message I could send today.
>
> Never invent a fact that isn't in the files. Where the evidence is thin, say so.
`;

export async function buildCorpus(opts: ExportOptions): Promise<{
  bytes: Uint8Array;
  count: number;
}> {
  const roster = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "subject"))
    .orderBy(asc(users.createdAt));

  const entries: ZipEntry[] = [];
  const jsonl: string[] = [];
  const index: string[] = ["# Members", ""];

  for (const r of roster) {
    const f = await subjectFile(r.id, opts);
    if (!f) continue;
    entries.push({ name: f.name, content: f.markdown });
    jsonl.push(JSON.stringify(f.record));
    index.push(`- [${f.record.name as string}](${f.name})`);
  }

  entries.push({ name: "README.md", content: README(entries.length, opts.contacts) });
  entries.push({ name: "index.md", content: index.join("\n") });
  entries.push({ name: "all-subjects.jsonl", content: jsonl.join("\n") });

  return { bytes: makeZip(entries), count: jsonl.length };
}
