import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { orderAssignments, orders } from "@/lib/db/schema";
import { mediaProvider } from "@/lib/media";
import { notifyGoddess } from "@/lib/push/broadcast";
import { alertOnce } from "@/lib/push/alerts";

/**
 * Photo proof for a task (R5). Accepts a raw image body (not multipart) and
 * stores it via the media provider at proofs/<orderId>/<userId>.<ext>, then
 * records the key on the CALLER'S OWN assignment only. Session-gated; a subject
 * can never touch another subject's row. Returns a short-lived signed URL so
 * the client shows the thumbnail immediately — the raw key is never exposed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const PROOF_TTL_S = 6 * 60 * 60;
const EXT: Record<string, string> = {
  "image/webp": ".webp",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: orderId } = await params;
  if (!UUID_RE.test(orderId)) {
    return Response.json({ error: "invalid order" }, { status: 400 });
  }

  const contentType =
    (req.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = EXT[contentType];
  if (!ext) {
    return Response.json({ error: "unsupported image type" }, { status: 415 });
  }

  // The caller must own an assignment on this order, and the order must accept
  // proof at all. This both authorizes the write and enforces her per-order dial.
  const [row] = await db
    .select({ proofMode: orders.proofMode })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .where(
      and(
        eq(orderAssignments.orderId, orderId),
        eq(orderAssignments.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    return Response.json({ error: "no such task" }, { status: 404 });
  }
  if (row.proofMode === "none") {
    return Response.json({ error: "proof not accepted" }, { status: 400 });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return Response.json({ error: "empty body" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "image too large (max 5MB)" }, { status: 413 });
  }

  const key = `proofs/${orderId}/${userId}${ext}`;
  await mediaProvider().putBlob(key, bytes, contentType);
  await db
    .update(orderAssignments)
    .set({ proofKey: key, proofAt: new Date() })
    .where(
      and(
        eq(orderAssignments.orderId, orderId),
        eq(orderAssignments.userId, userId),
      ),
    );

  // A proof sits waiting on her word — tell her, linked to the board where she
  // praises it. One alert per subject+task; never blocks the upload.
  if (alertOnce(`proof:${userId}:${orderId}`)) {
    await notifyGoddess(
      "A proof waits for you.",
      "Someone showed you they obeyed.",
      "/sanctum/orders",
    ).catch(() => {});
  }

  const proofUrl = await mediaProvider().signStreamUrl(key, PROOF_TTL_S);
  return Response.json({ ok: true, proofUrl });
}
