import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { percentileRank } from "./percentile";

export interface ObedienceStanding {
  /** Subjects considered (role = 'subject'). */
  subjectCount: number;
  /** 0..100 — share of the others this subject out-obeys. */
  percentile: number;
  /** Below five subjects a percentile is noise, so it stays hidden (R9.4). */
  eligible: boolean;
}

/** Small-N floor: below this a percentile feels fake, so it isn't shown. */
const MIN_SUBJECTS = 5;

/**
 * The subject's obedience percentile among ALL subjects (R9.4). ONE aggregate
 * pass computes every subject's composite score — hours under + tasks obeyed +
 * chain — returning ids + numbers only, never a name (D7). The pure math then
 * ranks this subject against the rest. Hidden until at least five subjects
 * exist, so a tiny crowd can't manufacture a standing.
 */
export async function obedienceStanding(
  userId: string,
): Promise<ObedienceStanding> {
  const result = await db.execute(sql`
    select u.id as user_id,
      coalesce(ls.secs, 0) / 3600.0
        + coalesce(oa.done, 0)
        + coalesce(c.current_len, 0) as score
    from users u
    left join (
      select user_id, sum(seconds_listened) as secs
      from listen_sessions group by user_id
    ) ls on ls.user_id = u.id
    left join (
      select user_id, count(*) as done
      from order_assignments where status = 'done' group by user_id
    ) oa on oa.user_id = u.id
    left join chains c on c.user_id = u.id
    where u.role = 'subject'
  `);

  const rows = (result as unknown as { user_id: string; score: unknown }[]) ?? [];
  const scored = rows.map((r) => ({
    userId: String(r.user_id),
    score: Number(r.score),
  }));

  const subjectCount = scored.length;
  const mine = scored.find((s) => s.userId === userId)?.score ?? 0;
  const others = scored.filter((s) => s.userId !== userId).map((s) => s.score);

  return {
    subjectCount,
    percentile: percentileRank(mine, others),
    eligible: subjectCount >= MIN_SUBJECTS,
  };
}
