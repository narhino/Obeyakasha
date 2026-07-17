import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { orderAssignments, users, wishes } from "@/lib/db/schema";
import { collarCard } from "@/lib/profile/collar";
import { getSetting } from "@/lib/settings";
import { rankFor } from "@/lib/ranks/logic";
import { Badge, Card, Display, Label, Whisper } from "@/components/ui";
import { MantraButton } from "@/components/chain/MantraButton";
import { SecretModeCard } from "@/components/me/SecretModeCard";
import { PetitionForm } from "@/components/me/PetitionForm";
import { copy, fill } from "@/copy/copy";

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export default async function MePage() {
  const session = await requireSubject();
  const uid = session.user.id;

  const [card, mantra, tasksRow, meRow, asks] = await Promise.all([
    collarCard(uid),
    getSetting("chain_mantra"),
    db
      .select({ c: count() })
      .from(orderAssignments)
      .where(
        and(eq(orderAssignments.userId, uid), eq(orderAssignments.status, "done")),
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
  ]);
  if (!card) return null;

  const rank = rankFor(card.filesCompleted, card.chain.currentLen);
  const tasksDone = tasksRow[0]?.c ?? 0;
  const hoursUnder = Math.round(card.listeningHours);
  const disguiseOn = Boolean(meRow[0]?.disguiseMode);

  const stats = [
    { label: copy.you.statsTasks, value: tasksDone },
    { label: copy.you.statsHours, value: `${hoursUnder}h` },
    { label: copy.you.statsFiles, value: card.filesCompleted },
    { label: copy.you.statsPrograms, value: card.programsCompleted },
  ];

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
        <Display className="text-3xl">
          {card.honorific ? `${card.honorific}'s ` : ""}
          {card.chosenName ?? copy.you.fallbackName}
        </Display>
        <Badge tone="gold">{rank.name}</Badge>
      </div>
      <Whisper className="mt-1">
        {fill(copy.you.claimed, { days: daysSince(card.claimedAt) })}
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
        <p className="mt-2 font-[family-name:var(--font-display)] text-5xl text-gold">
          {card.chain.currentLen}
          <span className="ml-3 align-middle font-[family-name:var(--font-body)] text-xs tracking-[0.14em] uppercase text-text-dim">
            days · best {card.chain.bestLen}
          </span>
        </p>
        <Whisper className="mt-2">
          {fill(copy.chain.kept, { chain: card.chain.currentLen })}
        </Whisper>
        <div className="mt-4">
          <MantraButton mantra={mantra} />
        </div>
      </Card>

      {/* Stats — tasks obeyed + hours under + devotion pieces */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <Whisper className="text-xs">{s.label}</Whisper>
            <p className="mt-1 text-2xl font-[family-name:var(--font-display)]">
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Triggers held */}
      <Card className="mt-6">
        <Label>{copy.you.triggersTitle}</Label>
        {card.triggersHeld.length === 0 ? (
          <Whisper className="mt-2">{copy.you.triggersEmpty}</Whisper>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.triggersHeld.map((t) => (
              <Badge key={t.name} tone="gold">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>

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
