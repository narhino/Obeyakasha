import { requireSubject } from "@/lib/auth-helpers";
import { collarCard } from "@/lib/profile/collar";
import { getSetting } from "@/lib/settings";
import { rankFor } from "@/lib/ranks/logic";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { MantraButton } from "@/components/chain/MantraButton";
import { copy, fill } from "@/copy/copy";

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
        <Whisper className="text-xs uppercase tracking-wide">
          {copy.chain.title}
        </Whisper>
        <p className="mt-1 font-[family-name:var(--font-display)] text-4xl text-gold">
          {card.chain.currentLen}
          <span className="ml-2 align-middle text-sm text-text-dim">
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
        <Whisper className="text-xs uppercase tracking-wide">
          Triggers held
        </Whisper>
        {card.triggersHeld.length === 0 ? (
          <Whisper className="mt-2">
            None yet. Finish a file to earn what it installs.
          </Whisper>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {card.triggersHeld.map((t) => (
              <Badge key={t.name} tone="gold">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
