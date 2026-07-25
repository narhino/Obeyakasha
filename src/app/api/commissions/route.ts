import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getSetting } from "@/lib/settings";
import { getCommissionForm } from "@/lib/commissions/form";
import { submitCommission, submitGuestCommission } from "@/lib/commissions/ops";
import {
  clientIp,
  fingerprint,
  guardGuestSubmission,
} from "@/lib/commissions/throttle";

/**
 * The commission intake. Two callers since R-anon:
 *  · a signed-in subject — unchanged behaviour, one live request at a time;
 *  · a STRANGER with an email address — same open/sealed state machine, plus the
 *    in-process throttle, because this is now a public write endpoint (S-10).
 *
 * Everything a caller sends is bounded before it is trusted: the body is capped
 * before it is parsed, and every answer key and value is length-limited by zod.
 */

/** Longest single answer we will store. The form's textareas are prose, not files. */
const ANSWER_MAX = 4_000;
/** Most answers one submission may carry (her form is ~11 fields). */
const MAX_FIELDS = 40;
/** Body ceiling, checked before JSON.parse ever runs (S-10: `req.json()` on an
 *  unbounded body parsed before zod could see it). */
const MAX_BODY_BYTES = 32 * 1_024;

const answerValue = z.union([
  z.string().max(ANSWER_MAX),
  z.number(),
  z.boolean(),
  z.array(z.string().max(ANSWER_MAX)).max(MAX_FIELDS),
]);

const answersSchema = z
  .record(z.string().min(1).max(64), answerValue)
  .refine((a) => Object.keys(a).length <= MAX_FIELDS, {
    message: "too_many_fields",
  });

const schema = z.object({
  answers: answersSchema,
  // Anonymous only. Ignored outright when a session is present — a subject's
  // commission is always attached to their account, never to a typed address.
  email: z.string().trim().email().max(200).optional(),
  name: z.string().trim().max(100).optional(),
});

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

/** Every required field on her current form must actually be answered. */
async function missingRequired(
  answers: Record<string, unknown>,
): Promise<string | null> {
  const fields = await getCommissionForm();
  for (const f of fields) {
    if (!f.required) continue;
    const v = answers[f.id];
    if (v == null || (typeof v === "string" && v.trim() === "")) return f.id;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();

  const body = await readBody(req);
  if (body === null) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { answers } = parsed.data;

  const open = await getSetting("commissions_open");

  // When sealed, this is only a waitlist ping — no fields to validate. When
  // open, a real request must carry every required field. Identical for both
  // callers: an anonymous petition can never bypass a closed or gated board.
  if (open) {
    const missing = await missingRequired(answers);
    if (missing) {
      return Response.json({ error: `missing_${missing}` }, { status: 400 });
    }
  }

  // ── Signed-in subject ────────────────────────────────────────────────────
  if (session?.user) {
    const r = await submitCommission(session.user.id, answers);
    if (r.duplicate) {
      // One at a time — she already holds a live request for this subject.
      return Response.json({ error: "one_at_a_time" }, { status: 409 });
    }
    return Response.json({ ok: true, waitlisted: r.waitlisted });
  }

  // ── Anonymous stranger (R-anon) ──────────────────────────────────────────
  const email = parsed.data.email;
  if (!email) {
    // No account and no address — she would have no way to answer at all.
    return Response.json({ error: "missing_email" }, { status: 400 });
  }

  const verdict = guardGuestSubmission(
    clientIp(req.headers),
    fingerprint(email, answers),
  );
  if (verdict === "throttled") {
    return Response.json({ error: "too_many" }, { status: 429 });
  }
  if (verdict === "duplicate") {
    // Accepted to their face, stored nowhere: a double-tapped submit must not
    // become two rows for her to read.
    return Response.json({ ok: true, waitlisted: !open });
  }

  const r = await submitGuestCommission({
    email,
    name: parsed.data.name ?? null,
    answers,
  });
  return Response.json({ ok: true, waitlisted: r.waitlisted });
}
