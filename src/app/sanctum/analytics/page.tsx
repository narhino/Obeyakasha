import Link from "next/link";
import { requireGoddess } from "@/lib/auth-helpers";
import { Badge, Card, Display, PageHeading, Whisper } from "@/components/ui";
import {
  RANGES,
  barPct,
  clockS,
  fillDays,
  humanMs,
  parseRange,
  pct,
  rangeStart,
  type RangeKey,
} from "@/lib/analytics/core";
import {
  commissionsByStage,
  commissionsByStatus,
  deviceSplit,
  dropOff,
  funnel,
  levelBreakdown,
  listeningTotals,
  people,
  requests,
  topPages,
  topReferrers,
  topTracks,
  trafficByDay,
  trafficTotals,
} from "@/lib/analytics/queries";
import { pushHealth } from "@/lib/push/receipts";

/**
 * The Sanctum's analytics (A21). HERS ONLY — `requireGoddess()` on top of the
 * layout's own gate and the middleware's, and not one number here is reachable
 * from any subject surface (D7).
 *
 * Every figure is computed on this server from her own tables. There is no
 * third-party analytics anywhere in this app; the CSP would refuse the request
 * even if there were.
 *
 * FAIL-SOFT: each query is wrapped, exactly as the rail's `navCounts` is. A
 * table that is missing, slow, or broken renders a dash — this page must never
 * be the reason she cannot see the rest of it.
 */
export const dynamic = "force-dynamic";

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error("[analytics] query failed:", err);
    return fallback;
  }
}

const DASH = "—";
const n = (v: number | null | undefined) =>
  v == null ? DASH : v.toLocaleString("en-US");
const p = (v: number | null) => (v == null ? DASH : `${v}%`);
const plural = (v: number, one: string, many: string) =>
  `${n(v)} ${v === 1 ? one : many}`;

export default async function SanctumAnalytics({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireGoddess();
  const range = parseRange((await searchParams).range);
  const since = rangeStart(range);
  const days = RANGES[range].days;

  const [
    traffic,
    byDay,
    pages,
    referrers,
    devices,
    fun,
    listening,
    tracks,
    drops,
    her,
    levels,
    reqs,
    byStatus,
    byStage,
    push,
  ] = await Promise.all([
    safe(trafficTotals(since), null),
    safe(trafficByDay(since), []),
    safe(topPages(since), []),
    safe(topReferrers(since), []),
    safe(deviceSplit(since), []),
    safe(funnel(since), null),
    safe(listeningTotals(since), null),
    safe(topTracks(since), []),
    safe(dropOff(since), []),
    safe(people(since), null),
    safe(levelBreakdown(), []),
    safe(requests(since), null),
    safe(commissionsByStatus(since), []),
    safe(commissionsByStage(since), []),
    safe(pushHealth(days), null),
  ]);

  const series = fillDays(byDay, days);
  const peakVisits = series.reduce((m, d) => Math.max(m, d.visits), 0);
  const deviceViews = devices.reduce((s, d) => s + d.views, 0);

  return (
    <div className="max-w-5xl">
      <PageHeading eyebrow="System" trailing={<RangePicker current={range} />}>
        What is happening
      </PageHeading>
      <Whisper className="mt-2">
        Counted here, by you, for you. Nothing leaves this server and no one else
        is ever told.
      </Whisper>

      {/* ── 1 · Traffic ──────────────────────────────────────────────── */}
      <Section title="Who came" caption={`Last ${RANGES[range].label.toLowerCase()}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Visits" value={n(traffic?.visits)} />
          <Stat label="Unique visitors" value={n(traffic?.visitors)} />
          <Stat
            label="Signed in"
            value={p(
              traffic && traffic.visits > 0
                ? pct(traffic.signedInVisits, traffic.visits)
                : null,
            )}
            note={
              traffic
                ? `${n(traffic.signedInVisits)} of ${n(traffic.visits)} visits`
                : undefined
            }
          />
          <Stat
            label="Median time on site"
            value={humanMs(traffic?.medianSessionMs)}
            note={
              traffic
                ? plural(traffic.dwellSamples, "measured view", "measured views")
                : undefined
            }
          />
        </div>

        <Card className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label-caps text-text-dim/70">Visits by day</p>
            <p className="nums-lining text-xs text-text-dim">
              peak {n(peakVisits)}
            </p>
          </div>
          {series.length === 0 || peakVisits === 0 ? (
            <Whisper className="mt-3">Nothing counted yet.</Whisper>
          ) : (
            <>
              <div
                className="mt-4 flex h-24 items-end gap-[2px]"
                role="img"
                aria-label={`Visits per day over the last ${RANGES[range].label}`}
              >
                {series.map((d) => (
                  <span
                    key={d.day}
                    title={`${d.day} · ${d.visits} visits · ${d.visitors} visitors`}
                    className="min-w-[2px] flex-1 rounded-t-[var(--radius-sm)] bg-gold/55 transition-colors duration-[var(--dur-med)] hover:bg-gold"
                    style={{ height: `${barPct(d.visits, peakVisits)}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[0.6875rem] text-text-dim/60">
                <span>{series[0]?.day}</span>
                <span>{series[series.length - 1]?.day}</span>
              </div>
            </>
          )}
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <p className="label-caps text-text-dim/70">Top pages</p>
            {pages.length === 0 ? (
              <Whisper className="mt-3">Nothing counted yet.</Whisper>
            ) : (
              <Table
                head={["Page", "Views", "Visitors", "Avg. time"]}
                rows={pages.map((x) => [
                  // Go look at the page they're actually landing on.
                  <Link
                    key="p"
                    href={x.path}
                    className="text-text transition-colors hover:text-gold"
                  >
                    {x.path}
                  </Link>,
                  n(x.views),
                  n(x.visitors),
                  humanMs(x.avgDwellMs),
                ])}
              />
            )}
          </Card>

          <div className="grid gap-4">
            <Card>
              <p className="label-caps text-text-dim/70">Where they came from</p>
              {referrers.length === 0 ? (
                <Whisper className="mt-3">
                  No outside links followed — everyone arrived directly.
                </Whisper>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {referrers.map((r) => (
                    <li key={r.host} className="flex justify-between gap-3">
                      <span className="truncate text-text">{r.host}</span>
                      <span className="nums-lining shrink-0 text-text-dim">
                        {n(r.views)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <p className="label-caps text-text-dim/70">On what</p>
              {devices.length === 0 ? (
                <Whisper className="mt-3">Nothing counted yet.</Whisper>
              ) : (
                <ul className="mt-3 space-y-2.5 text-sm">
                  {devices.map((d) => (
                    <li key={d.device}>
                      <div className="flex justify-between gap-3">
                        <span className="capitalize text-text">{d.device}</span>
                        <span className="nums-lining text-text-dim">
                          {p(pct(d.views, deviceViews))}
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-line">
                        <div
                          className="h-1 rounded-full bg-gold/70"
                          style={{ width: `${barPct(d.views, deviceViews)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </Section>

      {/* ── 2 · The funnel ───────────────────────────────────────────── */}
      <Section
        title="From stranger to claimed"
        caption="Each step, and what share of the one above it survived"
      >
        <Card>
          <ol className="divide-y divide-line/70">
            <FunnelStep label="Visitors" value={fun?.visitors ?? null} />
            <FunnelStep
              label="Opened a file"
              value={fun?.reachedFile ?? null}
              share={fun ? pct(fun.reachedFile, fun.visitors) : null}
            />
            <FunnelStep
              label="Played a free sample"
              value={fun?.samplePlays ?? null}
              share={null}
              note="Signed-in listens only. A logged-out sample play is deliberately not reported by the player, so the anonymous half of this number does not exist anywhere and is not guessed at here."
            />
            <FunnelStep
              label="Reached the gate"
              value={fun?.reachedGate ?? null}
              share={fun ? pct(fun.reachedGate, fun.visitors) : null}
              note="Share is of all visitors — the sample step above sits on a different base."
            />
            <FunnelStep
              label="Claimed an account"
              value={fun?.signedUp ?? null}
              share={fun ? pct(fun.signedUp, fun.reachedGate) : null}
            />
            <FunnelStep
              label="Entitled now"
              value={fun?.entitledNow ?? null}
              share={null}
              note="A state, not a period: everyone at level 1 or above right now, whenever they arrived."
            />
          </ol>
        </Card>
        {fun && fun.samplePlayers > 0 ? (
          <Whisper className="mt-2">
            {plural(fun.samplePlayers, "subject has", "subjects have")} tasted a
            sample in this window.
          </Whisper>
        ) : null}
      </Section>

      {/* ── 3 · Listening ────────────────────────────────────────────── */}
      <Section title="How deep they went">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Hours under"
            value={
              listening ? n(Math.round(listening.seconds / 3600)) : DASH
            }
          />
          <Stat label="Plays" value={n(listening?.plays)} />
          <Stat label="Listeners" value={n(listening?.listeners)} />
          <Stat
            label="Completion"
            value={p(listening ? pct(listening.completed, listening.plays) : null)}
            note={listening ? `${n(listening.completed)} finished` : undefined}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="label-caps text-text-dim/70">Most played</p>
            {tracks.length === 0 ? (
              <Whisper className="mt-3">No listens in this window.</Whisper>
            ) : (
              <Table
                head={["Track", "Plays", "Listeners", "Done"]}
                rows={tracks.map((t) => [
                  // A number she can act on: the row opens the file itself.
                  <Link
                    key="t"
                    href={`/sanctum/tracks/${t.id}`}
                    className="text-text transition-colors hover:text-gold"
                  >
                    {t.title}
                  </Link>,
                  n(t.plays),
                  n(t.listeners),
                  p(pct(t.completed, t.plays)),
                ])}
              />
            )}
          </Card>

          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <p className="label-caps text-text-dim/70">Where they fall out</p>
              <Badge tone="neutral">Drop reports</Badge>
            </div>
            {drops.length === 0 ? (
              <Whisper className="mt-3">
                No one has reported falling out in this window.
              </Whisper>
            ) : (
              <>
                <Table
                  head={["Track", "Reports", "Depth", "Typical stop"]}
                  rows={drops.map((d) => [
                    <Link
                      key="t"
                      href={`/sanctum/tracks/${d.id}`}
                      className="text-text transition-colors hover:text-gold"
                    >
                      {d.title}
                    </Link>,
                    n(d.reports),
                    d.avgDepth == null ? DASH : d.avgDepth.toFixed(1),
                    d.stopPct == null
                      ? clockS(d.avgStopS)
                      : `${clockS(d.avgStopS)} · ${d.stopPct}%`,
                  ])}
                />
                <Whisper className="mt-3 text-xs">
                  Depth is what they said (1–5). The stop is where their session
                  had actually reached when they fell out.
                </Whisper>
              </>
            )}
          </Card>
        </div>
      </Section>

      {/* ── 4 · Her people ───────────────────────────────────────────── */}
      <Section title="Hers">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Claimed"
            value={n(her?.subjects)}
            note={her ? `+${n(her.newSubjects)} in this window` : undefined}
          />
          <Stat
            label="Patreon linked"
            value={n(her?.linked)}
            note={her ? `+${n(her.newLinked)} in this window` : undefined}
          />
          <Stat label="Collared" value={n(her?.collared)} />
          <Stat label="Chains alive" value={n(her?.activeChains)} />
          <Stat
            label="Her voice allowed"
            value={n(her?.pushUsers)}
            note={
              her ? `${n(her.discreetUsers)} of them in discreet mode` : undefined
            }
          />
          <Stat label="App installed" value={n(her?.installedUsers)} />
          <Stat
            label="Pushes landed"
            value={push ? `${n(push.delivered)}/${n(push.attempted)}` : "—"}
            note={
              push
                ? `${n(push.opened)} opened · ${n(push.failed)} refused`
                : undefined
            }
          />
          <Stat label="Sealed (frozen)" value={n(her?.frozen)} />
          <Stat
            label="Below the threshold"
            value={n(her?.lapsed)}
            note="Claimed, but nothing entitles them right now"
          />
        </div>

        <Card className="mt-4">
          <p className="label-caps text-text-dim/70">By level</p>
          {levels.length === 0 ? (
            <Whisper className="mt-3">No entitlements yet.</Whisper>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {levels.map((l) => (
                <li
                  key={l.level}
                  className="rounded-[var(--radius)] border border-line bg-surface-raised px-3 py-2"
                >
                  <p className="text-[0.6875rem] uppercase tracking-[0.1em] text-text-dim">
                    {l.label ?? `Level ${l.level}`}
                  </p>
                  <p className="nums-lining font-[family-name:var(--font-display)] text-xl text-text">
                    {n(l.n)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      {/* ── 5 · Requests ─────────────────────────────────────────────── */}
      <Section title="What they asked for">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Commissions"
            value={n(reqs?.commissions)}
            note={
              reqs
                ? `${n(reqs.fromMembers)} from mine · ${plural(
                    reqs.fromGuests,
                    "stranger",
                    "strangers",
                  )}`
                : undefined
            }
          />
          <Stat
            label="Asks"
            value={n(reqs?.wishes)}
            note={reqs ? `${n(reqs.answered)} answered` : undefined}
          />
          <Stat
            label="Petitions"
            value={n(reqs?.petitions)}
            note={
              reqs
                ? `${n(reqs.collarPetitions)} waiting for the collar`
                : undefined
            }
          />
          <Stat
            label="Loves & words"
            value={n(reqs ? reqs.loves + reqs.comments : null)}
            note={
              reqs ? `${n(reqs.loves)} loves · ${n(reqs.comments)} comments` : undefined
            }
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="label-caps text-text-dim/70">Commissions by status</p>
            <Tally rows={byStatus} />
          </Card>
          <Card>
            <p className="label-caps text-text-dim/70">Commissions by stage</p>
            <Tally rows={byStage} />
          </Card>
        </div>
      </Section>

      <Whisper className="mt-10 text-xs">
        Visits are counted first-party: a random cookie, the page&apos;s route
        pattern, a device bucket and a referring host. No IP address, no
        user-agent, no query strings, no third party. Do Not Track is honoured,
        and rows age out on their own.
      </Whisper>
    </div>
  );
}

// ── presentational pieces (tokens only, no chart library) ─────────────────

function RangePicker({ current }: { current: RangeKey }) {
  const keys = Object.keys(RANGES) as RangeKey[];
  return (
    <nav className="flex items-center gap-1">
      {keys.map((k) => (
        <Link
          key={k}
          href={`/sanctum/analytics?range=${k}`}
          aria-current={k === current ? "page" : undefined}
          className={`rounded-[var(--radius)] px-2.5 py-1 text-[0.6875rem] uppercase tracking-[0.1em] transition-colors duration-[var(--dur-med)] ${
            k === current
              ? "bg-surface-raised text-gold"
              : "text-text-dim hover:bg-surface-raised hover:text-text"
          }`}
        >
          {RANGES[k].label}
        </Link>
      ))}
    </nav>
  );
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <Display as="h2" size="section" className="text-[1.4rem]">
          {title}
        </Display>
        {caption ? (
          <p className="text-[0.6875rem] uppercase tracking-[0.1em] text-text-dim/60">
            {caption}
          </p>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card raised>
      <p className="label-caps text-text-dim/70">{label}</p>
      <p className="nums-lining mt-1 font-[family-name:var(--font-display)] text-[length:var(--display-2)] leading-none text-text">
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-[0.6875rem] leading-snug text-text-dim/70">
          {note}
        </p>
      ) : null}
    </Card>
  );
}

function FunnelStep({
  label,
  value,
  share,
  note,
}: {
  label: string;
  value: number | null;
  share?: number | null;
  note?: string;
}) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-text">{label}</span>
        <span className="flex items-baseline gap-3">
          {share === undefined ? null : (
            <span className="nums-lining w-12 text-right text-xs text-gold/80">
              {share == null ? "" : `${share}%`}
            </span>
          )}
          <span className="nums-lining font-[family-name:var(--font-display)] text-xl text-text">
            {n(value)}
          </span>
        </span>
      </div>
      {note ? (
        <p className="mt-1 max-w-xl text-[0.6875rem] leading-snug text-text-dim/70">
          {note}
        </p>
      ) : null}
    </li>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[0.6875rem] uppercase tracking-[0.08em] text-text-dim/60">
            {head.map((h, i) => (
              <th key={h} className={`py-1 font-normal ${i === 0 ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri} className="border-t border-line/70">
              {cells.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2 ${
                    ci === 0
                      ? "max-w-[18rem] truncate pr-3"
                      : "nums-lining text-right text-text-dim"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tally({ rows }: { rows: { key: string; n: number }[] }) {
  if (rows.length === 0) {
    return <Whisper className="mt-3">Nothing in this window.</Whisper>;
  }
  const total = rows.reduce((s, r) => s + r.n, 0);
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-text capitalize">{r.key.replace(/_/g, " ")}</span>
            <span className="nums-lining text-text-dim">{n(r.n)}</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-line">
            <div
              className="h-1 rounded-full bg-gold/60"
              style={{ width: `${barPct(r.n, total)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
