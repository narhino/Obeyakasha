import type { NextRequest } from "next/server";
import { z } from "zod";
import { withSubject } from "@/lib/api";
import { getCommissionForm } from "@/lib/commissions/form";
import { submitCommission } from "@/lib/commissions/ops";

const schema = z.object({ answers: z.record(z.string(), z.unknown()) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  // Validate required fields are present.
  const fields = await getCommissionForm();
  for (const f of fields) {
    if (f.required) {
      const v = parsed.data.answers[f.id];
      if (v == null || (typeof v === "string" && v.trim() === "")) {
        return Response.json(
          { error: `missing_${f.id}` },
          { status: 400 },
        );
      }
    }
  }
  return withSubject(async (userId) => {
    const r = await submitCommission(userId, parsed.data.answers);
    return { ok: true, waitlisted: r.waitlisted };
  });
}
