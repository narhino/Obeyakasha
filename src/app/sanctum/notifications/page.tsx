import Link from "next/link";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { automations, devices, users } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";
import { pushConfigured } from "@/lib/push/send";
import { pushHealth } from "@/lib/push/receipts";
import { reverifySince } from "@/lib/push/verify";
import { TRIGGERS } from "@/lib/automations/triggers";
import {
  Badge,
  Button,
  Card,
  Display,
  PageHeading,
  Whisper,
} from "@/components/ui";
import { formatWhen } from "@/lib/format/when";
import { AutomationEditor } from "./AutomationEditor";
import {
  clearReverification,
  deleteAutomation,
  demandReverification,
  toggleAutomation,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SanctumNotifications() {
  await requireGoddess();

  const [rows, reach, health, since, masterOn, configured] = await Promise.all([
    db.select().from(automations).orderBy(desc(automations.updatedAt)),
    db
      .select({
        devices: sql<number>`count(*)::int`,
        subscribed: sql<number>`count(*) filter (where ${devices.pushSubscription} is not null)::int`,
        enabled: sql<number>`count(*) filter (where ${devices.pushEnabled})::int`,
        proved: sql<number>`count(${devices.pushVerifiedAt})::int`,
      })
      .from(devices),
    pushHealth(30),
    reverifySince(),
    getSetting("automations_enabled"),
    Promise.resolve(pushConfigured()),
  ]);

  // How many devices would be held right now if they visited.
  const owedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(devices)
    .where(
      since
        ? sql`${devices.pushVerifiedAt} is null or ${devices.pushVerifiedAt} < ${since}`
        : sql`${devices.pushVerifiedAt} is null`,
    );
  const owed = owedRows[0]?.n ?? 0;

  const r = reach[0] ?? { devices: 0, subscribed: 0, enabled: 0, proved: 0 };
  const subjectsWithDevice = await db
    .select({ n: sql<number>`count(distinct ${devices.userId})::int` })
    .from(devices)
    .where(isNotNull(devices.pushSubscription));
  const subjectCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, "subject"));

  const triggerLabel = (key: string) =>
    TRIGGERS.find((t) => t.key === key)?.label ?? key;

  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="Voice">Notifications</PageHeading>
      <Whisper className="mt-1">
        Whether you can reach them at all, and everything that speaks without
        you.
      </Whisper>

      {!configured ? (
        <Card className="mt-6 border-danger/60">
          <p className="text-sm text-danger">
            Push keys are not configured on the server. Nothing can be sent to
            anyone until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set.
          </p>
        </Card>
      ) : null}

      {/* ── Reach ────────────────────────────────────────────────────────── */}
      <Display as="h2" className="mt-8 text-xl">
        Can you reach them
      </Display>
      <Whisper className="mt-1 text-xs">
        Proved means one real notification was sent and the device reported it
        appearing. A browser saying &quot;allowed&quot; has never meant that.
      </Whisper>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Stat label="Devices" value={r.devices} />
        <Stat label="Subscribed" value={r.subscribed} />
        <Stat
          label="Proved working"
          value={r.proved}
          tone={r.proved > 0 ? "gold" : "danger"}
        />
        <Stat
          label="Subjects reachable"
          value={subjectsWithDevice[0]?.n ?? 0}
          note={`of ${subjectCount[0]?.n ?? 0} claimed`}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Sent (30d)" value={health.attempted} />
        <Stat
          label="Landed"
          value={health.delivered}
          tone={health.delivered > 0 ? "gold" : "danger"}
        />
        <Stat label="Opened" value={health.opened} />
      </div>

      {/* ── The re-proof lever ───────────────────────────────────────────── */}
      <Card className="mt-4" raised>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="label-caps text-gold">Demand proof from everyone</p>
            <Whisper className="mt-1 text-xs">
              Every device is held at the threshold on its next visit until one
              real notification is seen landing. Anyone whose line works proves
              it in seconds and barely notices; only the broken ones are
              stopped. It touches no subscriptions and sends nothing now.
            </Whisper>
            {since ? (
              <p className="mt-2 text-sm text-text">
                Standing since {formatWhen(since)} ·{" "}
                <span className={owed > 0 ? "text-gold" : "text-text-dim"}>
                  {owed} device{owed === 1 ? "" : "s"} still owing proof
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-text-dim">
                Not standing. {owed} device{owed === 1 ? " has" : "s have"} never
                proved.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <form action={demandReverification}>
              <Button type="submit" size="sm" variant="gold">
                {since ? "Demand again (now)" : "Demand it"}
              </Button>
            </form>
            {since ? (
              <form action={clearReverification}>
                <Button type="submit" size="sm" variant="ghost">
                  Lift it
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ── Automations ──────────────────────────────────────────────────── */}
      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-2">
        <Display as="h2" className="text-xl">
          What speaks without you
        </Display>
        <Badge tone={masterOn ? "gold" : "sealed"}>
          {masterOn ? "automations running" : "all automations silenced"}
        </Badge>
      </div>
      <Whisper className="mt-1 text-xs">
        {masterOn ? (
          <>
            Each one below fires on its own. Turn any of them off here, or
            silence every one at once from{" "}
            <Link href="/sanctum/access" className="underline hover:text-gold">
              Settings
            </Link>
            .
          </>
        ) : (
          <>
            The master switch in{" "}
            <Link href="/sanctum/access" className="underline hover:text-gold">
              Settings
            </Link>{" "}
            is off, so none of these fire — whatever they say below.
          </>
        )}
      </Whisper>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <Card>
            <Whisper>
              Nothing speaks without you. Add one below and it stays off until
              you say otherwise.
            </Whisper>
          </Card>
        ) : (
          rows.map((a) => (
            <Card key={a.id} className={a.enabled ? "border-gold/30" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-[family-name:var(--font-display)] text-lg text-text">
                      {a.label}
                    </p>
                    <Badge tone={a.enabled ? "gold" : "sealed"}>
                      {a.enabled ? "on" : "off"}
                    </Badge>
                    <Badge tone="neutral">{triggerLabel(a.trigger)}</Badge>
                    {!a.respectQuietHours ? (
                      <Badge tone="danger">ignores quiet hours</Badge>
                    ) : null}
                  </div>
                  {/* What it actually says — the thing she could never see. */}
                  <div className="mt-2 rounded-[var(--radius)] border border-line/60 bg-bg/40 p-2.5">
                    <p className="text-sm text-text">{a.title}</p>
                    {a.body ? (
                      <p className="text-sm text-text-dim">{a.body}</p>
                    ) : null}
                    <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/60">
                      opens {a.deepLink ?? "/"}
                      {a.params?.days ? ` · after ${a.params.days} days` : ""}
                    </p>
                  </div>
                  <Whisper className="mt-1.5 text-xs">
                    {a.lastRunAt
                      ? `Last ran ${formatWhen(a.lastRunAt)} · reached ${a.lastReached}`
                      : "Has never run."}
                  </Whisper>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={toggleAutomation}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant={a.enabled ? "ghost" : "gold"}
                    >
                      {a.enabled ? "Silence" : "Let it speak"}
                    </Button>
                  </form>
                  <form action={deleteAutomation}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button type="submit" size="sm" variant="danger">
                      Remove
                    </Button>
                  </form>
                </div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold">
                  Change its words
                </summary>
                <div className="mt-3">
                  <AutomationEditor
                    existing={{
                      id: a.id,
                      trigger: a.trigger,
                      label: a.label,
                      title: a.title,
                      body: a.body,
                      deepLink: a.deepLink,
                      days: a.params?.days ?? null,
                      audience: a.audience,
                      respectQuietHours: a.respectQuietHours,
                      enabled: a.enabled,
                    }}
                  />
                </div>
              </details>
            </Card>
          ))
        )}
      </div>

      <Display as="h2" className="mt-10 text-xl">
        Add one
      </Display>
      <Whisper className="mt-1 text-xs">
        Pick when it fires, then write what it says. The list of triggers is
        fixed — those are the moments the worker can actually detect. A new kind
        of moment needs a code change, not a form.
      </Whisper>
      <Card className="mt-3">
        <AutomationEditor />
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: string;
  tone?: "gold" | "danger";
}) {
  return (
    <Card className="py-3">
      <p className="label-caps text-text-dim/70">{label}</p>
      <p
        className={`nums-lining mt-1 font-[family-name:var(--font-display)] text-2xl ${
          tone === "gold"
            ? "text-gold"
            : tone === "danger"
              ? "text-danger"
              : "text-text"
        }`}
      >
        {value}
      </p>
      {note ? <Whisper className="text-xs">{note}</Whisper> : null}
    </Card>
  );
}
