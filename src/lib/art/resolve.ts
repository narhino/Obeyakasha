import { mediaProvider } from "@/lib/media";
import { COLLECTION_COVER, defaultCoverFor } from "./defaults";

/**
 * Server-side cover resolution (DESIGN-DIRECTION §D1). Turns a track/collection's
 * stored `artworkKey` + tags into a renderable cover URL, NEVER exposing a raw
 * storage key: a custom upload is served through the media provider's signed,
 * short-lived URL; everything else falls back to the committed bespoke art.
 *
 * Signing is a cheap HMAC (no network), so resolving per-row across a whole list
 * stays free of N+1 round-trips — callers batch with Promise.all.
 */
const ARTWORK_TTL_S = 6 * 60 * 60;

/** Sign one artwork key to a short-lived URL; null on missing key or failure. */
export async function signArtwork(
  artworkKey: string | null,
): Promise<string | null> {
  if (!artworkKey) return null;
  try {
    return await mediaProvider().signStreamUrl(artworkKey, ARTWORK_TTL_S);
  } catch {
    return null;
  }
}

/**
 * A track's display cover: custom upload (signed) → the bespoke default for its
 * tags → default.jpg. `tagValues` are lowercased tag values (e.g. ["chastity"]).
 */
export async function resolveTrackCover(
  artworkKey: string | null,
  tagValues: readonly string[],
): Promise<string> {
  const signed = await signArtwork(artworkKey);
  return signed ?? defaultCoverFor(tagValues);
}

/**
 * A collection's display cover: custom upload (signed) → collection.jpg.
 * Series, programs and playlists share the one bound-volume fallback.
 */
export async function resolveCollectionCover(
  artworkKey: string | null,
): Promise<string> {
  const signed = await signArtwork(artworkKey);
  return signed ?? COLLECTION_COVER;
}
