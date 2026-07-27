import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { threads } from "@/lib/db/schema";
import { threadMessages } from "@/lib/messages/ops";
import { collarCard } from "@/lib/profile/collar";
import { requireGoddess } from "@/lib/auth-helpers";
import { Badge, Card, Display, Whisper } from "@/components/ui";
import { IconWarn } from "@/components/ui/icons";
import { ReplyBox } from "@/components/messages/ReplyBox";
import { unsendMessage } from "../actions";
import { formatWhen } from "@/lib/format/when";

export default async function SanctumThread({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  await requireGoddess();
  const { threadId } = await params;
  const [thread] = await db
    .select({ userId: threads.userId })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);
  if (!thread) notFound();

  const [msgs, card] = await Promise.all([
    threadMessages(threadId),
    collarCard(thread.userId),
  ]);
  const flagged = msgs.some((m) => m.flaggedSafety && !m.readAt);

  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-[1fr_260px]">
      <div>
        <Display className="text-2xl">
          {card?.chosenName ?? "subject"}
        </Display>
        {flagged ? (
          <div className="mt-2 rounded-[var(--radius)] border border-danger bg-danger/10 p-2 text-sm text-danger">
            Flagged for personal handling — no AI draft offered. Respond with care.
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {msgs.map((m) => (
            <div
              key={m.id}
              className={`group max-w-[80%] ${m.sender === "goddess" ? "ml-auto" : "mr-auto"}`}
            >
              <div
                className={`rounded-[var(--radius-lg)] px-3 py-2 text-sm ${
                  m.sender === "goddess"
                    ? "bg-accent text-text"
                    : "border border-line bg-surface text-text"
                }`}
              >
                {m.body}
                {m.flaggedSafety ? (
                  <span className="ml-2 inline-flex translate-y-0.5 text-danger">
                    <IconWarn size={13} />
                  </span>
                ) : null}
              </div>
              {/* Her own line: whether they've read it, and the way to take it
                  back. The receipt always shows; unsend stays quiet until
                  hovered or focused so the thread reads cleanly. */}
              {m.sender === "goddess" ? (
                <div className="mt-1 flex items-center justify-end gap-3">
                  <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/70">
                    {m.readAt ? (
                      <span className="text-gold/80">
                        Seen {formatWhen(m.readAt)}
                      </span>
                    ) : (
                      "Delivered · not yet read"
                    )}
                  </span>
                  <form
                    action={unsendMessage}
                    className="opacity-0 transition-opacity duration-[var(--dur-med)] focus-within:opacity-100 group-hover:opacity-100"
                  >
                    <input type="hidden" name="messageId" value={m.id} />
                    <input type="hidden" name="threadId" value={threadId} />
                    <button
                      type="submit"
                      className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/70 transition-colors hover:text-danger"
                    >
                      Unsay it
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <ReplyBox threadId={threadId} safetyFlagged={flagged} />
      </div>

      {/* Profile context — she never answers blind (A1). */}
      <aside className="space-y-3">
        <Card raised>
          <Whisper className="text-xs uppercase tracking-wide">Collar</Whisper>
          {card ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>{card.honorific ?? "Goddess"}&apos;s {card.chosenName}</p>
              <p className="text-text-dim">
                chain {card.chain.currentLen}d · {card.filesCompleted} files ·{" "}
                {card.listeningHours}h
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {card.triggersHeld.slice(0, 6).map((t) => (
                  <Badge key={t.name} tone="gold">
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      </aside>
    </div>
  );
}
