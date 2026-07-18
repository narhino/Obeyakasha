import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { Card, Display, PageHeading, Whisper } from "@/components/ui";

/** Internal-only analytics (A21) — no third-party trackers. */
export default async function SanctumAnalytics() {
  const perTrack = await db.execute<{
    title: string;
    plays: number;
    completed: number;
    listeners: number;
    mean_depth: number | null;
  }>(sql`
    SELECT t.title,
           count(ls.id)::int AS plays,
           count(ls.id) FILTER (WHERE ls.completed)::int AS completed,
           count(DISTINCT ls.user_id)::int AS listeners,
           round(avg(dr.depth), 1) AS mean_depth
    FROM tracks t
    LEFT JOIN listen_sessions ls ON ls.track_id = t.id
    LEFT JOIN drop_reports dr ON dr.track_id = t.id
    WHERE t.visibility = 'published'
    GROUP BY t.id, t.title
    ORDER BY plays DESC
    LIMIT 30
  `);

  const active = (await db.execute<{ dau: number; wau: number }>(sql`
    SELECT
      count(DISTINCT user_id) FILTER (WHERE started_at > now() - interval '1 day')::int AS dau,
      count(DISTINCT user_id) FILTER (WHERE started_at > now() - interval '7 days')::int AS wau
    FROM listen_sessions
  `)) as unknown as { dau: number; wau: number }[];
  const dau = active[0]?.dau ?? 0;
  const wau = active[0]?.wau ?? 0;

  const rows = perTrack as unknown as {
    title: string;
    plays: number;
    completed: number;
    listeners: number;
    mean_depth: number | null;
  }[];

  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="System">Analytics</PageHeading>
      <Whisper className="mt-1">Yours only. Nothing leaves this server.</Whisper>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card raised>
          <Whisper>Active today</Whisper>
          <p className="nums-lining mt-1 text-3xl font-[family-name:var(--font-display)]">{dau}</p>
        </Card>
        <Card raised>
          <Whisper>Active this week</Whisper>
          <p className="nums-lining mt-1 text-3xl font-[family-name:var(--font-display)]">{wau}</p>
        </Card>
      </div>

      <Display as="h2" className="mt-8 text-xl">
        By track
      </Display>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-dim">
              <th className="py-1">Track</th>
              <th>Plays</th>
              <th>Completion</th>
              <th>Listeners</th>
              <th>Mean depth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.title} className="border-t border-line">
                <td className="py-2 pr-2 text-text">{r.title}</td>
                <td>{r.plays}</td>
                <td>
                  {r.plays > 0
                    ? Math.round((r.completed / r.plays) * 100) + "%"
                    : "—"}
                </td>
                <td>{r.listeners}</td>
                <td>{r.mean_depth ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
