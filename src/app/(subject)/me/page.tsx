import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { orderAssignments, users, wishes } from "@/lib/db/schema";
import { collarCard } from "@/lib/profile/collar";
import { vaultFor } from "@/lib/profile/vault";
import { obedienceStanding } from "@/lib/stats/standing";
import { oathStatusFor } from "@/lib/oath/resolve";
import { resolveAccess } from "@/lib/entitlements/resolve";
import { getSetting } from "@/lib/settings";
import { rankFor } from "@/lib/ranks/logic";
import { plural } from "@/lib/format/plural";
import { formatDate } from "@/lib/format/when";
import { Badge, Card, Display, Label, Whisper } from "@/components/ui";
import { MantraButton } from "@/components/chain/MantraButton";
import { SecretModeCard } from "@/components/me/SecretModeCard";
import { OathCard } from "@/components/me/OathCard";
import { PetitionForm } from "@/components/me/PetitionForm";
import { TriggerVault } from "@/components/me/TriggerVault";
import { copy, fill } from "@/copy/copy";

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export default async function MePage() {
  const session = await requireSubject();
  const uid = session.user.id;

  const access = await resolveAccess(uid);
  const [card, mantra, tasksRow, meRow, asks, vault, standing, oath] =
    await Promise.all([
      collarCard(uid),
      getSetting("chain_mantra"),
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
        .select({ disguiseMode: users.disguiseMode })
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
    ]);
  if (!card) return null;

  const rank = rankFor(card.filesCompleted, card.chain.currentLen);
  const tasksDone = tasksRow[0]?.c ?? 0;
  const hoursUnder = Math.round(card.listeningHours);
  const disguiseOn = Boolean(meRow[0]?.disguiseMode);

  const stats: { label: string; value: number; unit?: string }[] = [
    { label: copy.you.statsTasks, value: tasksDone },
    { label: copy.you.statsHours, value: hoursUnder, unit: "h" },
    { label: copy.you.statsFiles, value: card.filesCompleted },
    { label: copy.you.statsPrograms, value: card.programsCompleted },
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
    {
      href: "/settings",
      label: copy.you.rooms.settingsLabel,
      hint: copy.you.rooms.settingsHint,
    },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* Identity */}
      <div className="flex items-center justify-between gap-3">
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

      {/* Secret mode — top of You, impossible to miss */}
      <div className="mt-6">
        <SecretModeCard initialOn={disguiseOn} />
      </div>

      {/* Chain */}
      <Card raised className="mt-6">
        <Label>{copy.chain.title}</Label>
        <p className="nums-lining mt-2 font-[family-name:var(--font-display)] text-5xl text-gold">
          {card.chain.currentLen}
          <span className="ml-3 align-middle font-[family-name:var(--font-body)] text-xs tracking-[0.14em] uppercase text-text-dim">
            {plural(card.chain.currentLen, "day")} · best {card.chain.bestLen}
          </span>
        </p>
        <Whisper className="mt-2">
          {fill(copy.chain.kept, {
            chain: card.chain.currentLen,
            unit: plural(card.chain.currentLen, "day"),
          })}
        </Whisper>
        <div className="mt-4">
          <MantraButton mantra={mantra} />
        </div>
      </Card>

      {/* The Oath — the collar, earned by the chain (R9.5) */}
      <OathCard
        state={oath.state}
        currentStreak={oath.currentStreak}
        minStreak={oath.minStreak}
        sinceLabel={oath.oathAt ? formatDate(oath.oathAt) : null}
      />

      {/* Stats — tasks obeyed + hours under + devotion pieces */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <Whisper className="text-xs">{s.label}</Whisper>
            <p className="nums-lining mt-1 text-2xl font-[family-name:var(--font-display)]">
              {s.value}
              {s.unit ? (
                <span className="ml-0.5 font-[family-name:var(--font-body)] text-sm text-text-dim">
                  {s.unit}
                </span>
              ) : null}
            </p>
          </Card>
        ))}
      </div>

      {/* Obedience percentile — anonymous + aggregate (D7), hidden below 5 subjects */}
      {standing.eligible ? (
        <Whisper className="mt-3 text-center text-xs italic text-gold/80">
          {fill(copy.you.percentile, { n: standing.percentile })}
        </Whisper>
      ) : null}

      {/* Trigger Vault — what she's installed + the sealed slots that wait */}
      <TriggerVault carried={vault.carried} waiting={vault.waiting} />

      {/* Ask — petition her */}
      <div className="mt-6">
        <PetitionForm />
      </div>

      {/* Your asks + her answers */}
      {asks.length > 0 ? (
        <section className="mt-6">
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
        </section>
      ) : null}

      {/* Rooms not in the tab bar live here (mobile reachability) */}
      <div className="mt-6 grid grid-cols-2 gap-3">
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
    </main>
  );
}
