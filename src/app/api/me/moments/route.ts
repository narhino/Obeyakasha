import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { moments } from "@/lib/db/schema";
import { TOUCH_TTL_MS } from "@/lib/listen/live";

const FIELDS = {
  id: moments.id,
  kind: moments.kind,
  payload: moments.payload,
  createdAt: moments.createdAt,
} as const;

/**
 * The subject's un-shown moments (R7 ritual + R9.1 live touch).
 *
 * Default (`GET /api/me/moments`): the ritual queue shown full-screen on a
 * subject's return — oldest first, capped at three. It EXCLUDES the live-only
 * "touch" kind, so her in-session neck-touch can never surface as a session-start
 * ritual pop-up (R9.1).
 *
 * `?kinds=touch`: the live channel polled by the in-session overlay while audio
 * plays. Only un-shown touches from the last ten minutes — an older one is a
 * gesture whose moment has passed, so it expires unshown.
 */
export async function GET(req: Request) {
  return withSubject(async (userId) => {
    const kinds = new URL(req.url).searchParams.get("kinds");

    if (kinds === "touch") {
      const cutoff = new Date(Date.now() - TOUCH_TTL_MS);
      const rows = await db
        .select(FIELDS)
        .from(moments)
        .where(
          and(
            eq(moments.userId, userId),
            eq(moments.kind, "touch"),
            isNull(moments.shownAt),
            gt(moments.createdAt, cutoff),
          ),
        )
        .orderBy(asc(moments.createdAt))
        .limit(3);
      return { moments: rows };
    }

    const rows = await db
      .select(FIELDS)
      .from(moments)
      .where(
        and(
          eq(moments.userId, userId),
          isNull(moments.shownAt),
          ne(moments.kind, "touch"),
        ),
      )
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
