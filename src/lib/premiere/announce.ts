import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { broadcast } from "@/lib/push/broadcast";
import { logAudit } from "@/lib/audit";
import { copy } from "@/copy/copy";

/**
 * Premiere appointments (R9.6). Find published tracks whose premiereAt has just
 * passed and haven't been announced, then push "It's time. Come under." to their
 * level. Premieres are appointments, so quiet hours yield (respectQuietHours
 * false). The update to premiereAnnouncedAt is the CLAIM — `WHERE
 * premiere_announced_at IS NULL` means two overlapping ticks (or a restart) can
 * never double-announce the same premiere. NEVER throws (worker-wrapped).
 */
export async function announceDuePremieres(now: Date = new Date()): Promise<void> {
  const due = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      slug: tracks.slug,
      minAccessLevel: tracks.minAccessLevel,
    })
    .from(tracks)
    .where(
      and(
        eq(tracks.visibility, "published"),
        isNotNull(tracks.premiereAt),
        lte(tracks.premiereAt, now),
        isNull(tracks.premiereAnnouncedAt),
      ),
    );
  if (due.length === 0) return;

  for (const t of due) {
    const claimed = await db
      .update(tracks)
      .set({ premiereAnnouncedAt: now })
      .where(and(eq(tracks.id, t.id), isNull(tracks.premiereAnnouncedAt)))
      .returning({ id: tracks.id });
    if (claimed.length === 0) continue; // another tick claimed it first

    await broadcast({
      title: copy.library.premiere.push.title,
      body: t.title,
      deepLink: `/library/track/${t.slug}`,
      audience: { type: "level", level: t.minAccessLevel },
      kind: "manual",
      respectQuietHours: false,
    });
    await logAudit(null, "premiere.announced", { trackId: t.id });
  }
}
