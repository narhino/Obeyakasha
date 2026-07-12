import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { threads, users } from "@/lib/db/schema";
import { collarCard } from "@/lib/profile/collar";
import { profileTimeline } from "@/lib/profile/timeline";
import { getOrCreateThread } from "@/lib/messages/ops";
import { requireGoddess } from "@/lib/auth-helpers";
import { Badge, Button, Card, Display, Input, Whisper } from "@/components/ui";
import { personalPush, renameSubject } from "../actions";

export default async function SubjectProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireGoddess();
  const { id } = await params;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();

  const [card, timeline, threadId] = await Promise.all([
    collarCard(id),
    profileTimeline(id),
    getOrCreateThread(id),
  ]);
  void threads;

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">
        {card?.honorific ? `${card.honorific}'s ` : ""}
        {card?.chosenName ?? "subject"}
      </Display>
      <Whisper className="mt-1">{user.email}</Whisper>

      {card ? (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Badge tone="gold">chain {card.chain.currentLen}d</Badge>
          <Badge tone="neutral">{card.filesCompleted} files</Badge>
          <Badge tone="neutral">{card.listeningHours}h</Badge>
          <Badge tone="neutral">{card.triggersHeld.length} triggers</Badge>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card>
          <Whisper className="text-xs">Rename (an ownership ritual)</Whisper>
          <form action={renameSubject} className="mt-2 flex gap-2">
            <input type="hidden" name="userId" value={id} />
            <Input name="name" defaultValue={card?.chosenName ?? ""} className="flex-1" />
            <Button type="submit" size="sm" variant="gold">
              Rename
            </Button>
          </form>
        </Card>
        <Card>
          <Whisper className="text-xs">Say something only to them</Whisper>
          <form action={personalPush} className="mt-2 flex gap-2">
            <input type="hidden" name="userId" value={id} />
            <Input name="message" placeholder="I saw what you did last night." className="flex-1" />
            <Button type="submit" size="sm">
              Send
            </Button>
          </form>
        </Card>
      </div>

      <Link
        href={`/sanctum/messages/${threadId}`}
        className="mt-4 inline-block text-sm text-gold underline"
      >
        Open conversation →
      </Link>

      <Display as="h2" className="mt-8 text-xl">
        Timeline
      </Display>
      <div className="mt-3 space-y-1.5">
        {timeline.length === 0 ? (
          <Whisper>Nothing yet.</Whisper>
        ) : (
          timeline.map((e, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-text-dim/70">
                {e.at.toISOString().slice(0, 10)}
              </span>
              <span className="text-text">{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
