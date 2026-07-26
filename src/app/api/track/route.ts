import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/commissions/throttle";
import {
  DWELL_MAX_MS,
  deviceFromUa,
  normalizePath,
  normalizeReferrerHost,
} from "@/lib/analytics/core";
import { recordDwell, recordView } from "@/lib/analytics/record";
import { guardTrackEvent } from "@/lib/analytics/throttle";

/**
 * First-party page-view intake (A21). No auth required — a logged-out visitor is
 * most of the funnel — and no third party is ever contacted, because there is no
 * third party: this writes one row to her own Postgres and nothing else.
 *
 * WHAT LEAVES THE REQUEST AND IS THEN DISCARDED: the IP (throttle bucket only,
 * never stored) and the user-agent (bucketed to mobile/tablet/desktop, string
 * dropped). WHAT IS STORED is in `src/lib/db/schema/analytics.ts`.
 *
 * TWO SHAPES, one endpoint:
 *  · `{ path, referrer? }` → insert a view, reply `{ viewId }`.
 *  · `{ viewId, dwellMs }` → fold a dwell into that view (monotonic).
 * The dwell call is the one the client makes with `navigator.sendBeacon`, which
 * cannot read a response — hence the split, and hence the id coming back from
 * the first (ordinary fetch) call.
 */

/** The visitor cookie. Random uuid, minted server-side, ~180 days. */
const COOKIE = "oa_vid";
const COOKIE_MAX_AGE = 180 * 24 * 60 * 60;
/** Body ceiling, checked before JSON.parse ever runs (S-10). This body is tiny. */
const MAX_BODY_BYTES = 1_024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.union([
  z.object({
    path: z.string().min(1).max(512),
    // A host, not a URL — but normalizeReferrerHost refuses anything that is
    // not a bare hostname anyway, so a client bug cannot smuggle a full URL in.
    referrer: z.string().max(256).optional(),
  }),
  z.object({
    viewId: z.string().regex(UUID),
    dwellMs: z.number().int().min(0).max(DWELL_MAX_MS),
  }),
]);

/** Read the body with a hard ceiling, then parse. Null = refuse. */
async function readBody(req: NextRequest): Promise<unknown | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const raw = await req.text().catch(() => null);
  if (raw == null || raw.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Existing cookie, or a fresh uuid to mint onto the response. */
function resolveVisitor(req: NextRequest): { id: string; fresh: boolean } {
  const existing = req.cookies.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return { id: existing, fresh: false };
  return { id: randomUUID(), fresh: true };
}

function reply(
  body: Record<string, unknown>,
  visitor: { id: string; fresh: boolean },
  status = 200,
): NextResponse {
  const res = NextResponse.json(body, { status });
  if (visitor.fresh) {
    // httpOnly: nothing client-side needs to read this, and sendBeacon carries
    // cookies on same-origin requests regardless. Lax + Secure(prod) matches the
    // posture of every other cookie this app sets.
    res.cookies.set({
      name: COOKIE,
      value: visitor.id,
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    });
  }
  return res;
}

export async function POST(req: NextRequest) {
  const visitor = resolveVisitor(req);

  const body = await readBody(req);
  if (body === null) return reply({ ok: false }, visitor, 400);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return reply({ ok: false }, visitor, 400);

  if (guardTrackEvent(visitor.id, clientIp(req.headers)) === "throttled") {
    // Quietly refused. The client never retries and never shows anything —
    // analytics must not be able to affect what a visitor experiences.
    return reply({ ok: false }, visitor, 429);
  }

  try {
    // ── dwell for an earlier view ──────────────────────────────────────────
    if ("viewId" in parsed.data) {
      await recordDwell(parsed.data.viewId, parsed.data.dwellMs);
      return reply({ ok: true }, visitor);
    }

    // ── a new view ─────────────────────────────────────────────────────────
    const path = normalizePath(parsed.data.path);
    if (!path) return reply({ ok: true }, visitor); // not a tracked surface

    const session = await auth();
    const viewId = await recordView({
      visitorId: visitor.id,
      userId: session?.user?.id ?? null,
      path,
      referrerHost: normalizeReferrerHost(parsed.data.referrer),
      device: deviceFromUa(req.headers.get("user-agent")),
      isSignedIn: Boolean(session?.user),
    });
    return reply({ ok: true, viewId }, visitor);
  } catch (err) {
    // A failed measurement must never become a failed page. Log and move on.
    console.error("[track] failed:", err);
    return reply({ ok: false }, visitor, 200);
  }
}
