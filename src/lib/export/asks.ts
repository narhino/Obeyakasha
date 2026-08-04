import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks, users, wishClusters, wishes } from "@/lib/db/schema";

/**
 * Every ask, as one document to write the next script from.
 *
 * The board is for answering one person. This is the other job: sitting down to
 * make something and wanting to know what they are actually begging for, in
 * THEIR words — because the words they use are the words the file should use.
 *
 * So it carries the asks verbatim, grouped by any cluster she's already made,
 * with what's already in the library alongside — a brief that proposes a file
 * she recorded last month is a wasted brief.
 *
 * No names beyond a chosen name and short id: writing a script needs the
 * craving, not the person.
 */

function when(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "—";
}

/** Keep a member's own text from closing a fence and eating the document. */
function safe(s: string): string {
  return s.replace(/```/g, "'''").trim();
}

const PROMPT = `## How to use this

Paste this whole file into an AI and start with something like:

> These are the asks my members have sent me — what they're asking me to make,
> in their own words. The library section lists what I've already recorded.
>
> 1. Group the asks by what they're really asking for, not by their wording.
>    Tell me how many people are in each group and quote the lines that define it.
> 2. Rank the groups by how many people want it AND how strongly they want it —
>    say which signal you're weighing where they disagree.
> 3. Ignore or flag anything I've already made.
> 4. For the top 3, write me a script brief: the fantasy in one line, the arc
>    from induction to end, the specific images and phrases to use (lift these
>    from their own words — that's why they're here), what to avoid, and a title.
> 5. Tell me what nobody has asked for out loud but the asks imply.
>
> Quote real lines as evidence. Don't invent a demand that isn't in here.
`;

export interface AsksExport {
  markdown: string;
  count: number;
}

export async function buildAsksDoc(): Promise<AsksExport> {
  const [rows, clusters, live] = await Promise.all([
    db
      .select({
        id: wishes.id,
        title: wishes.title,
        body: wishes.body,
        status: wishes.status,
        source: wishes.source,
        reply: wishes.reply,
        createdAt: wishes.createdAt,
        name: users.chosenName,
        userId: users.id,
      })
      .from(wishes)
      .innerJoin(users, eq(users.id, wishes.userId))
      .orderBy(desc(wishes.createdAt)),
    db.select().from(wishClusters).orderBy(desc(wishClusters.createdAt)),
    // The live catalog only — a brief that proposes something already recorded
    // is a wasted brief. Never a draft, never a subject's private upload (D7).
    db
      .select({ title: tracks.title, publishedAt: tracks.publishedAt })
      .from(tracks)
      .where(and(isNotNull(tracks.publishedAt), isNull(tracks.ownerUserId)))
      .orderBy(asc(tracks.title)),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const clustered = new Set<string>();
  const L: string[] = [];

  L.push("# What they are asking me for");
  L.push("");
  L.push(
    `${rows.length} ask(s) from ${new Set(rows.map((r) => r.userId)).size} member(s)` +
      (rows.length
        ? `, ${when(rows[rows.length - 1]!.createdAt)} to ${when(rows[0]!.createdAt)}.`
        : "."),
  );
  L.push("");
  const open = rows.filter((r) => r.status === "new").length;
  const planned = rows.filter((r) => r.status === "planned").length;
  const shipped = rows.filter((r) => r.status === "shipped").length;
  L.push(`Unanswered: **${open}** · planned: ${planned} · already made: ${shipped}`);
  L.push("");
  L.push(PROMPT);
  L.push("");

  const render = (r: (typeof rows)[number]) => {
    const head = r.title ? `**${safe(r.title)}**` : "_(no title)_";
    L.push(
      `### ${head}  \`${r.userId.slice(0, 8)}\`${r.name ? ` · ${r.name}` : ""}`,
    );
    L.push("");
    L.push(`_${when(r.createdAt)} · ${r.status} · via ${r.source}_`);
    L.push("");
    L.push(safe(r.body).split("\n").map((l) => `> ${l}`).join("\n"));
    if (r.reply) {
      L.push("");
      L.push(`**She answered:** ${safe(r.reply)}`);
    }
    L.push("");
  };

  if (clusters.length) {
    L.push("---");
    L.push("");
    L.push("## Already grouped");
    L.push("");
    L.push("_Groups she made herself — trust these over your own grouping._");
    L.push("");
    for (const c of clusters) {
      const members = c.wishIds.map((id) => byId.get(id)).filter(Boolean);
      if (!members.length) continue;
      L.push(`## ${safe(c.label)}  — ${members.length} ask(s) · ${c.status}`);
      L.push("");
      for (const m of members) {
        clustered.add(m!.id);
        render(m!);
      }
    }
  }

  const loose = rows.filter((r) => !clustered.has(r.id));
  if (loose.length) {
    L.push("---");
    L.push("");
    L.push(clusters.length ? "## Ungrouped asks" : "## Every ask");
    L.push("");
    L.push("_Newest first._");
    L.push("");
    for (const r of loose) render(r);
  }

  L.push("---");
  L.push("");
  L.push("## Already in the library — don't propose these again");
  L.push("");
  if (live.length === 0) {
    L.push("_Nothing published yet._");
  } else {
    for (const t of live) L.push(`- ${safe(t.title)}  _(${when(t.publishedAt)})_`);
  }
  L.push("");

  return { markdown: L.join("\n"), count: rows.length };
}
