import { and, asc, eq, isNull } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { moments } from "@/lib/db/schema";

/** The subject's un-shown ritual moments — oldest first, capped at three (R7). */
export async function GET() {
  return withSubject(async (userId) => {
    const rows = await db
      .select({
        id: moments.id,
        kind: moments.kind,
        payload: moments.payload,
        createdAt: moments.createdAt,
      })
      .from(moments)
      .where(and(eq(moments.userId, userId), isNull(moments.shownAt)))
      .orderBy(asc(moments.createdAt))
      .limit(3);
    return { moments: rows };
  });
}

/** Mark one moment shown once its overlay is dismissed (scoped to the caller). */
export async function POST(req: Request) {
  return withSubject(async (userId) => {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) throw new Error("no moment");
    await db
      .update(moments)
      .set({ shownAt: new Date() })
      .where(and(eq(moments.id, id), eq(moments.userId, userId)));
    return { ok: true };
  });
}
