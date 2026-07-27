import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { completeVerification, startVerification } from "@/lib/push/verify";

/**
 * The proving handshake.
 *
 * POST  { deviceId }  → send one real push at that device (session-scoped).
 * PUT   { token }     → the service worker echoing that push back.
 *
 * The two halves are deliberately different verbs on one route: the POST is a
 * request from a signed-in page, the PUT is the device answering. The PUT
 * carries no session on purpose — a service worker's fetch may run with an
 * expired cookie, and the token IS the credential: it is a fresh UUID, stored
 * on exactly one device row, burned on use, and useless to anyone who doesn't
 * already receive that device's pushes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startSchema = z.object({ deviceId: z.string().uuid() });
const ackSchema = z.object({ token: z.string().uuid() });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const result = await startVerification(
    session.user.id,
    parsed.data.deviceId,
  );
  return Response.json(result);
}

export async function PUT(req: NextRequest) {
  const parsed = ackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const ok = await completeVerification(parsed.data.token);
  return Response.json({ ok });
}
