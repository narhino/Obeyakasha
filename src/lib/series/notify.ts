import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, playlists } from "@/lib/db/schema";
import { broadcast } from "@/lib/push/broadcast";
import { copy, fill } from "@/copy/copy";

/** Deep link to a subject-facing series page — also the dedupe key. */
function seriesDeepLink(playlistId: string): string {
  return `/library/series/${playlistId}`;
}

/**
 * Announce that a track joined a series (R7). Called from every place a track is
 * added to a playlist (the Series board and the dossier's Placement panel).
 *
 * Rules:
 *  - Only a **published** series is worth announcing (drafts stay silent).
 *  - The audience is everyone (`all`) — a level push per-file would be noisy;
 *    the series card itself gates what they can play.
 *  - Bulk adds collapse: if this series already pushed in the last 10 minutes
 *    (a notification row shares its deep link), we stay quiet, so dropping ten
 *    tracks in at once is one whisper, not ten.
 *
 * NEVER throws — the placement itself already succeeded; a push hiccup must not
 * fail the action.
 */
export async function notifySeriesTrackAdded(playlistId: string): Promise<void> {
  try {
    const [series] = await db
      .select({ title: playlists.title, visibility: playlists.visibility })
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);
    if (!series || series.visibility !== "published") return;

    const deepLink = seriesDeepLink(playlistId);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.deepLink, deepLink),
          gt(notifications.sentAt, tenMinutesAgo),
        ),
      )
      .limit(1);
    if (recent) return; // collapsed into the recent burst

    await broadcast({
      title: fill(copy.library.seriesAddPush.title, { series: series.title }),
      body: copy.library.seriesAddPush.body,
      deepLink,
      audience: { type: "all" },
      kind: "automation",
    });
  } catch (err) {
    console.error("[series] notifySeriesTrackAdded failed:", err);
  }
}
