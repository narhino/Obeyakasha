import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { broadcast } from "@/lib/push/broadcast";
import { mediaProvider } from "@/lib/media";
import { copy } from "@/copy/copy";

/**
 * F1 — "subjects bring their own files". Owner-only side effects of a personal
 * upload: the ready notification and deletion of its stored objects. The privacy
 * predicate that keeps these files private lives in `queries.ts`
 * (`notSomeoneElses`); this module is the write side.
 */

/**
 * When a subject's personal upload finishes the pipeline (reaches `ready`), tell
 * its OWNER — and only the owner — through the disguise-aware push choke point
 * (`sendToDevice`, via `broadcast`) plus the inbox (the notification row
 * `broadcast` writes): "It's ready for you." No-op for the public catalog
 * (ownerUserId null) so her own tracks never trip it. NEVER throws — it is fired
 * from the pipeline's `setPipeline`, and a push hiccup must not wedge the worker.
 */
export async function notifyOwnerUploadReady(trackId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        ownerUserId: tracks.ownerUserId,
        slug: tracks.slug,
      })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .limit(1);
    if (!row?.ownerUserId) return; // catalog track — not a subject's upload

    await broadcast({
      title: copy.uploads.readyPush.title,
      body: copy.uploads.readyPush.body,
      deepLink: `/library/track/${row.slug}`,
      audience: { type: "users", userIds: [row.ownerUserId] },
      kind: "automation",
    });
  } catch (err) {
    console.error("[uploads] notifyOwnerUploadReady failed:", err);
  }
}

export type DeleteUploadResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" };

/**
 * Delete a personal upload: remove every stored object (stream + original + any
 * artwork) and then the row (all child rows — tags, transcript, listens — cascade
 * off `tracks.id`). Hard-scoped to personal uploads: a track with a null
 * `ownerUserId` (her catalog) is refused, so this helper can never touch the
 * catalog. Pass `requireOwner` for a subject deleting THEIR OWN file (ownership
 * is verified); omit it for the goddess (Sanctum oversight). Callers audit.
 */
export async function deleteUpload(
  trackId: string,
  opts: { requireOwner?: string } = {},
): Promise<DeleteUploadResult> {
  const [row] = await db
    .select({
      ownerUserId: tracks.ownerUserId,
      streamKey: tracks.streamKey,
      storageKey: tracks.storageKey,
      artworkKey: tracks.artworkKey,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  // Only ever a personal upload — never her catalog.
  if (row.ownerUserId == null) return { ok: false, reason: "forbidden" };
  // A subject may only delete their own.
  if (opts.requireOwner && row.ownerUserId !== opts.requireOwner) {
    return { ok: false, reason: "forbidden" };
  }

  const provider = mediaProvider();
  for (const key of [row.streamKey, row.storageKey, row.artworkKey]) {
    if (key) await provider.delete(key).catch(() => {});
  }
  await db.delete(tracks).where(eq(tracks.id, trackId));
  return { ok: true };
}
