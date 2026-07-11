import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * HMAC stream tokens (PLAN §7.3, A22 baseline). A stream URL is only valid if
 * it carries a signature this server produced, and only until it expires — no
 * public, guessable file URLs.
 */
function sign(streamKey: string, exp: number): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`${streamKey}:${exp}`)
    .digest("hex");
}

export function makeStreamToken(streamKey: string, ttlSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { token: sign(streamKey, exp), exp };
}

export function verifyStreamToken(
  streamKey: string,
  exp: number,
  token: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(streamKey, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
