import Link from "next/link";
import { requireSubject } from "@/lib/auth-helpers";
import { collarCard } from "@/lib/profile/collar";
import { getSetting } from "@/lib/settings";
import { rankFor } from "@/lib/ranks/logic";
import { Badge, Card, Display, Label, Whisper } from "@/components/ui";
import { MantraButton } from "@/components/chain/MantraButton";
import { copy, fill } from "@/copy/copy";

const ROOMS = [
  { href: "/asks", label: "Asks", hint: "When she questions you" },
  { href: "/orders", label: "Orders", hint: "What she commands" },
  { href: "/commissions", label: "Commission", hint: "Ask for your own" },
  { href: "/settings", label: "Settings", hint: "Quiet hours, your data" },
];

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export default async function MePage() {
  const session = await requireSubject();
  const [card, mantra] = await Promise.all([
    collarCard(session.user.id),
    getSetting("chain_mantra"),
  ]);
  if (!card) return null;
  const rank = rankFor(card.filesCompleted, card.chain.currentLen);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <Display className="text-3xl">
          {card.honorific ? `${card.honorific}'s ` : ""}
          {card.chosenName ?? "subject"}
        </Display>
        <Badge tone="gold">{rank.name}</Badge>
      </div>
      <Whisper className="mt-1">
        Claimed {daysSince(card.claimedAt)} days ago.
        {rank.next
          ? ` ${rank.next.minScore - rank.score} more to ${rank.next.name}.`
          : " You've reached the bottom. 888."}
      </Whisper>

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

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <Whisper className="text-xs">Files completed</Whisper>
          <p className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {card.filesCompleted}
          </p>
        </Card>
        <Card>
          <Whisper className="text-xs">Hours under</Whisper>
          <p className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {card.listeningHours}
          </p>
        </Card>
        <Card>
          <Whisper className="text-xs">Programs finished</Whisper>
          <p className="mt-1 text-2xl font-[family-name:var(--font-display)]">
            {card.programsCompleted}
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <Label>Triggers held</Label>
        {card.triggersHeld.length === 0 ? (
          <Whisper className="mt-2">
            None yet. Finish a file to earn what it installs.
          </Whisper>
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

      {/* Rooms not in the tab bar live here (mobile reachability) */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        {ROOMS.map((r) => (
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
