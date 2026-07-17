import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { playlists } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { mediaProvider } from "@/lib/media";

/**
 * Series cover upload (R4). Accepts a raw image body (not multipart) for one
 * series and stores it via the media provider at art/<playlistId>.webp, then
 * records the key on the playlist. Goddess-only. Query: ?playlistId=.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const playlistId = searchParams.get("playlistId") ?? "";
  if (!UUID_RE.test(playlistId)) {
    return Response.json({ error: "invalid playlistId" }, { status: 400 });
  }

  const contentType = (req.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!ALLOWED.has(contentType)) {
    return Response.json({ error: "unsupported image type" }, { status: 415 });
  }

  if (!req.body && !req.headers.get("content-length")) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }

  const [pl] = await db
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
  if (!pl) {
    return Response.json({ error: "no such series" }, { status: 404 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "image too large (max 5MB)" }, { status: 413 });
  }

  const artworkKey = await mediaProvider().putArtwork(playlistId, bytes, contentType);
  await db
    .update(playlists)
    .set({ artworkKey })
    .where(eq(playlists.id, playlistId));
  await logAudit(session.user.id, "series.art_uploaded", { playlistId });

  // Don't echo the raw storage key back — the client just refreshes to get the
  // signed cover the server re-derives.
  return Response.json({ ok: true });
}
