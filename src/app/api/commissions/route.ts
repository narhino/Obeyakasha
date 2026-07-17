import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getSetting } from "@/lib/settings";
import { getCommissionForm } from "@/lib/commissions/form";
import { submitCommission } from "@/lib/commissions/ops";

const schema = z.object({ answers: z.record(z.string(), z.unknown()) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const open = await getSetting("commissions_open");

  // When sealed, this is only a waitlist ping — no fields to validate. When
  // open, a real request must carry every required field.
  if (open) {
    const fields = await getCommissionForm();
    for (const f of fields) {
      if (f.required) {
        const v = parsed.data.answers[f.id];
        if (v == null || (typeof v === "string" && v.trim() === "")) {
          return Response.json({ error: `missing_${f.id}` }, { status: 400 });
        }
      }
    }
  }

  const r = await submitCommission(session.user.id, parsed.data.answers);
  if (r.duplicate) {
    // One at a time — she already holds a live request for this subject.
    return Response.json({ error: "one_at_a_time" }, { status: 409 });
  }
  return Response.json({ ok: true, waitlisted: r.waitlisted });
}
