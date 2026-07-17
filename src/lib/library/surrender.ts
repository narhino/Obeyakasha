import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { listenSessions, tags, trackTags } from "@/lib/db/schema";
import { listLibraryTracks, type LibraryTrack } from "./queries";

export interface SurrenderTrack {
  id: string;
  title: string;
  durationS: number | null;
  artworkKey: string | null;
}

const MIN_PICKS = 3;
const MAX_PICKS = 5;
const TOP_TAGS = 6;

function toSurrender(t: LibraryTrack): SurrenderTrack {
  return {
    id: t.id,
    title: t.title,
    durationS: t.durationS,
    artworkKey: t.artworkKey,
  };
}

/**
 * "She chooses" (R9.7). Picks 3–5 tracks the subject can actually play:
 * unheard-first from the tags they listen to most, then the newest at their
 * level. Entitled + published only (via listLibraryTracks' `unlocked` flag).
 * Returns [] when nothing is eligible so the caller shows a line, not a dead tap.
 */
export async function pickSurrender(
  userId: string,
  accessLevel: number,
): Promise<SurrenderTrack[]> {
  const all = await listLibraryTracks(userId, accessLevel);
  const playable = all.filter((t) => t.unlocked); // newest-first (query order)
  if (playable.length === 0) return [];

  const [heardRows, topTagRows] = await Promise.all([
    db
      .selectDistinct({ trackId: listenSessions.trackId })
      .from(listenSessions)
      .where(eq(listenSessions.userId, userId)),
    db
      .select({ value: tags.value, n: sql<number>`count(*)::int` })
      .from(listenSessions)
      .innerJoin(trackTags, eq(trackTags.trackId, listenSessions.trackId))
      .innerJoin(tags, eq(tags.id, trackTags.tagId))
      .where(eq(listenSessions.userId, userId))
      .groupBy(tags.value)
      .orderBy(desc(sql`count(*)`))
      .limit(TOP_TAGS),
  ]);

  const heard = new Set(heardRows.map((r) => r.trackId));
  const topTags = new Set(topTagRows.map((r) => r.value));
  const unheard = playable.filter((t) => !heard.has(t.id));

  const picks: SurrenderTrack[] = [];
  const taken = new Set<string>();
  const take = (t: LibraryTrack) => {
    if (taken.has(t.id) || picks.length >= MAX_PICKS) return;
    taken.add(t.id);
    picks.push(toSurrender(t));
  };

  // 1) Unheard tracks sharing her most-listened tags — most overlap first
  //    (stable sort keeps newest-first within a tie, from the query order).
  if (topTags.size > 0) {
    unheard
      .map((t) => ({
        t,
        score: t.tags.reduce(
          (n, tag) => n + (topTags.has(tag.value) ? 1 : 0),
          0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .forEach(({ t }) => take(t));
  }

  // 2) Fill from the newest unheard, then 3) the newest overall — so she always
  //    hands back at least a few, even for a subject who's heard everything.
  for (const t of unheard) if (picks.length < MIN_PICKS) take(t);
  for (const t of playable) if (picks.length < MIN_PICKS) take(t);

  return picks.slice(0, MAX_PICKS);
}
