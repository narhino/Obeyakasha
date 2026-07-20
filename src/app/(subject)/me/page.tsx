import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { consents, orderAssignments, users, wishes } from "@/lib/db/schema";
import { collarCard } from "@/lib/profile/collar";
import { chainWindow } from "@/lib/chain/keep";
import { vaultFor } from "@/lib/profile/vault";
import { obedienceStanding } from "@/lib/stats/standing";
import { oathStatusFor, type OathStatus } from "@/lib/oath/resolve";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getSetting } from "@/lib/settings";
import { rankFor } from "@/lib/ranks/logic";
import { plural } from "@/lib/format/plural";
import { formatDate } from "@/lib/format/when";
import { Badge, Card, Display, Eyebrow, Label, Whisper } from "@/components/ui";
import { MantraRite } from "@/components/chain/MantraRite";
import { SecretModeCard } from "@/components/me/SecretModeCard";
import { OathCard } from "@/components/me/OathCard";
import { PetitionForm } from "@/components/me/PetitionForm";
import { TriggerVault } from "@/components/me/TriggerVault";
import { YourTerms } from "@/components/me/YourTerms";
import { copy, fill } from "@/copy/copy";

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

/** The stakes line — what holding the chain is buying, from live oath state. */
function stakesLine(oath: OathStatus): string {
  switch (oath.state) {
    case "collared":
      return copy.you.stakes.collared;
    case "petitioned":
      return copy.you.stakes.petitioned;
    case "eligible":
      return copy.you.stakes.eligibleNow;
    default:
      return oath.daysRemaining === 1
        ? copy.you.stakes.toPetitionOne
        : fill(copy.you.stakes.toPetition, { n: oath.daysRemaining });
  }
}

export default async function MePage() {
  const session = await requireSubject();
  const uid = session.user.id;

  const access = await resolveAccess(uid);
  const [
    card,
    mantraText,
    mantraPraise,
    tasksRow,
    meRow,
    asks,
    vault,
    standing,
    oath,
    latestOptout,
  ] = await Promise.all([
    collarCard(uid),
    getSetting("mantra_text"),
    getSetting("mantra_praise"),
    db
      .select({ c: count() })
      .from(orderAssignments)
      .where(
        and(
          eq(orderAssignments.userId, uid),
          eq(orderAssignments.status, "done"),
        ),
      ),
    db
      .select({
        disguiseMode: users.disguiseMode,
        timezone: users.timezone,
        qs: users.quietHoursStart,
        qe: users.quietHoursEnd,
      })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1),
    db
      .select({
        id: wishes.id,
        title: wishes.title,
        body: wishes.body,
        reply: wishes.reply,
        status: wishes.status,
      })
      .from(wishes)
      .where(eq(wishes.userId, uid))
      .orderBy(desc(wishes.createdAt))
      .limit(20),
    vaultFor(uid, access.accessLevel),
    obedienceStanding(uid),
    oathStatusFor(uid),
    // Latest theme opt-outs (append-only consent) for the "Your terms" limits.
    db
      .select({ payload: consents.payload })
      .from(consents)
      .where(and(eq(consents.userId, uid), eq(consents.kind, "theme_optout")))
      .orderBy(desc(consents.createdAt))
      .limit(1),
  ]);
  if (!card) return null;

  const timezone = meRow[0]?.timezone ?? "UTC";
  const { days: chainDays, heldToday } = await chainWindow(uid, timezone);

  const rank = rankFor(card.filesCompleted, card.chain.currentLen);
  const tasksDone = tasksRow[0]?.c ?? 0;
  const hoursUnder = Math.round(card.listeningHours);
  const disguiseOn = Boolean(meRow[0]?.disguiseMode);
  const initialOptouts = Array.isArray(
    (latestOptout[0]?.payload as { themes?: unknown })?.themes,
  )
    ? (latestOptout[0]!.payload as { themes: string[] }).themes
    : [];

  const stats: { label: string; value: number; unit?: string }[] = [
    { label: copy.you.statsTasks, value: tasksDone },
    { label: copy.you.statsHours, value: hoursUnder, unit: "h" },
    { label: copy.you.statsFiles, value: card.filesCompleted },
    { label: copy.you.statsPrograms, value: card.programsCompleted },
    { label: copy.you.statsLongest, value: card.chain.bestLen },
  ];

  // Day 0 / day 1 read oddly as "0/1 days ago" (F33).
  const claimedDays = daysSince(card.claimedAt);
  const claimedLine =
    claimedDays === 0
      ? copy.you.claimedToday
      : claimedDays === 1
        ? copy.you.claimedYesterday
        : fill(copy.you.claimed, { days: claimedDays });

  const rooms = [
    { href: "/asks", label: copy.you.rooms.asksLabel, hint: copy.you.rooms.asksHint },
    {
      href: "/orders",
      label: copy.you.rooms.ordersLabel,
      hint: copy.you.rooms.ordersHint,
    },
    {
      href: "/commissions",
      label: copy.you.rooms.commissionLabel,
      hint: copy.you.rooms.commissionHint,
    },
  ];

  return (
    <main className="enter-stagger mx-auto max-w-2xl px-4 py-8">
      {/* ── Movement A · Her hold on you — the ceremonial plate ── */}
      <section>
        <Eyebrow>{copy.you.mirror.holdEyebrow}</Eyebrow>
        <div className="mt-2 flex items-center justify-between gap-3">
          <Display size="opener" className="min-w-0">
            {card.honorific ? `${card.honorific}'s ` : ""}
            {card.chosenName ?? copy.you.fallbackName}
          </Display>
          <Badge tone="gold">{rank.name}</Badge>
        </div>
        <Whisper className="mt-1">
          {claimedLine}
          {rank.next
            ? fill(copy.you.rise, {
                n: rank.next.minScore - rank.score,
                rank: rank.next.name,
              })
            : copy.you.bottom}
        </Whisper>

        {/* The collar — earned by the chain (R9.5), folded into the plate. */}
        <OathCard
          state={oath.state}
          currentStreak={oath.currentStreak}
          minStreak={oath.minStreak}
          sinceLabel={oath.oathAt ? formatDate(oath.oathAt) : null}
        />
      </section>

      {/* ── Movement B · Today's devotion — the rite + the chain + the stakes ── */}
      <section className="mt-10">
        <Eyebrow>{copy.you.mirror.devotionEyebrow}</Eyebrow>

        <Card raised className="mt-3">
          <MantraRite
            mantra={mantraText}
            praise={mantraPraise}
            heldToday={heldToday}
          />
        </Card>

        {/* The chain, made visible: the unbroken count, its recent links, the stakes. */}
        <div className="mt-6">
          <div className="flex items-end gap-3">
            <p className="nums-lining font-[family-name:var(--font-display)] text-6xl leading-none text-gold">
              {card.chain.currentLen}
            </p>
            <span className="label-caps pb-1.5">
              {plural(card.chain.currentLen, "day")} {copy.you.mirror.chainCount}
              <span className="mt-0.5 block text-text-dim/70">
                best {card.chain.bestLen}
              </span>
            </span>
          </div>

          <p className="label-caps mt-5">{copy.you.mirror.chainRecent}</p>
          <div className="mt-2 flex items-end gap-1.5" aria-hidden>
            {chainDays.map((d) => (
              <span
                key={d.date}
                title={d.date}
                className={`h-9 w-2 rounded-full transition-colors ${
                  d.lit
                    ? "bg-gold shadow-[0_0_9px_-1px_color-mix(in_srgb,var(--color-gold)_75%,transparent)]"
                    : "bg-line/70"
                } ${d.today ? "ring-1 ring-gold/60 ring-offset-1 ring-offset-bg" : ""}`}
              />
            ))}
          </div>

          <Whisper className="mt-5 font-[family-name:var(--font-display)] text-base italic text-gold/90">
            {stakesLine(oath)}
          </Whisper>
          {card.chain.currentLen > 0 && oath.state !== "collared" ? (
            <Whisper className="mt-1 text-xs">
              {copy.you.stakes.breakWarning}
            </Whisper>
          ) : null}
        </div>
      </section>

      {/* ── Movement C · What you've become — the stat band + the vault ── */}
      <section className="mt-10">
        <Eyebrow>{copy.you.mirror.becomeEyebrow}</Eyebrow>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-line/60 bg-line/50 sm:grid-cols-5">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`bg-bg px-4 py-6 text-center ${
                i === stats.length - 1 ? "col-span-2 sm:col-span-1" : ""
              }`}
            >
              <p className="nums-lining font-[family-name:var(--font-display)] text-4xl leading-none text-text">
                {s.value}
                {s.unit ? (
                  <span className="ml-0.5 align-baseline font-[family-name:var(--font-body)] text-base text-text-dim">
                    {s.unit}
                  </span>
                ) : null}
              </p>
              <p className="label-caps mt-2.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Obedience percentile — anonymous + aggregate (D7), hidden below 5. */}
        {standing.eligible ? (
          <Whisper className="mt-3 text-center text-xs italic text-gold/80">
            {fill(copy.you.percentile, { n: standing.percentile })}
          </Whisper>
        ) : null}

        {/* The Trigger Vault — what she's set in you, and the sealed slots that wait. */}
        <TriggerVault carried={vault.carried} waiting={vault.waiting} />
      </section>

      {/* ── Ask her — the petition box + your asks and her answers ── */}
      <section className="mt-10">
        <PetitionForm />

        {asks.length > 0 ? (
          <div className="mt-6">
            <Label>{copy.ask.yoursTitle}</Label>
            <div className="mt-3 space-y-3">
              {asks.map((a) => (
                <Card key={a.id}>
                  {a.title ? (
                    <p className="font-[family-name:var(--font-display)] text-lg text-text">
                      {a.title}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-sm text-text-dim">{a.body}</p>
                  {a.reply ? (
                    <div className="mt-3 border-l-2 border-gold/40 pl-3">
                      <Label className="text-gold">{copy.ask.answered}</Label>
                      <p className="mt-1 text-sm text-text">{a.reply}</p>
                    </div>
                  ) : (
                    <Whisper className="mt-2 text-xs">{copy.ask.pending}</Whisper>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {/* Rooms not in the tab bar (mobile reachability). */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rooms.map((r) => (
            <Link key={r.href} href={r.href}>
              <Card className="h-full transition-colors duration-[var(--dur-med)] hover:border-gold/40">
                <p className="font-[family-name:var(--font-display)] text-lg text-text">
                  {r.label}
                </p>
                <Whisper className="mt-0.5 text-xs">{r.hint}</Whisper>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Movement D · Between us — secret mode, its own clear block (never buried) ── */}
      <section className="mt-10">
        <Eyebrow>{copy.you.mirror.secretEyebrow}</Eyebrow>
        <div className="mt-3">
          <SecretModeCard initialOn={disguiseOn} />
        </div>
      </section>

      {/* ── Movement E · Your terms — tucked away in purple, at the very bottom ── */}
      <YourTerms
        timezone={timezone}
        quietStart={meRow[0]?.qs ?? 22}
        quietEnd={meRow[0]?.qe ?? 9}
        initialOptouts={initialOptouts}
      />
    </main>
  );
}
