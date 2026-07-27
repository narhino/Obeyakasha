import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { mediaProvider } from "@/lib/media";

/**
 * Image for a whisper she is about to post. Accepts a raw image body (not
 * multipart) and returns the stored key, which the composer submits with the
 * whisper. Goddess-only. Mirrors the series-art route; the key is opaque to
 * clients — the feed serves it back as a short-lived signed URL, never raw.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "goddess") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const contentType =
    (req.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = ALLOWED.get(contentType);
  if (!ext) {
    return Response.json({ error: "unsupported image type" }, { status: 415 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "image too large (max 8MB)" }, { status: 413 });
  }

  // Random name: a whisper has no id yet at upload time, and the filename must
  // never carry anything a caller chose.
  const key = `whispers/${crypto.randomUUID()}${ext}`;
  await mediaProvider().putBlob(key, bytes, contentType);
  return Response.json({ imageKey: key });
}
