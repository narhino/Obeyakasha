import type { NextRequest } from "next/server";
import { mediaProvider } from "@/lib/media";
import { verifyStreamToken } from "@/lib/media/sign";

/**
 * Serves audio bytes for the LOCAL media provider with HTTP Range support
 * (seek/resume). Access is proven by the short-lived HMAC token that the
 * entitlement-checked /api/tracks/:id/stream-url endpoint issued. In prod the
 * client fetches Bunny's CDN directly and never hits this route.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const key = searchParams.get("key");
  const exp = Number(searchParams.get("exp"));
  const token = searchParams.get("token");

  if (!key || !token || !verifyStreamToken(key, exp, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  const provider = mediaProvider();
  if (provider.kind !== "local") {
    return new Response("Not found", { status: 404 });
  }

  let result;
  try {
    result = await provider.readStream(key, req.headers.get("range"));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": result.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  const body: BodyInit =
    result.body instanceof Uint8Array
      ? // copy into a fresh ArrayBuffer-backed view (unreachable for local, which
        // always streams — kept for interface completeness)
        Uint8Array.from(result.body)
      : result.body;

  if (result.range) {
    const { start, end } = result.range;
    headers.set("Content-Range", `bytes ${start}-${end}/${result.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(result.size));
  return new Response(body, { status: 200, headers });
}
