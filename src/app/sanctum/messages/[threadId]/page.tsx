import Link from "next/link";
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
import { reachFor, subjectReach, type PushReach } from "@/lib/push/receipts";

/**
 * What became of the push behind one of her messages. Deliberately distinct
 * from "read": a subject can open the app and read her words without ever
 * having seen the notification, and a notification can land on a locked screen
 * and never be opened. She asked to see both, so both are here.
 */
function PushReceipt({ reach }: { reach?: PushReach }) {
  if (!reach) {
    return (
      <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/45">
        No push
      </span>
    );
  }
  const label =
    reach.state === "opened"
      ? `Push opened ${reach.openedAt ? formatWhen(reach.openedAt) : ""}`
      : reach.state === "delivered"
        ? `Push landed ${reach.deliveredAt ? formatWhen(reach.deliveredAt) : ""}`
        : "Push sent · never landed";
  const tone =
    reach.state === "opened"
      ? "text-gold/80"
      : reach.state === "delivered"
        ? "text-text-dim/80"
        : "text-danger/70";
  return (
    <span
      title={`Attempted on ${reach.devices} device${reach.devices === 1 ? "" : "s"}`}
      className={`text-[0.6875rem] uppercase tracking-[0.14em] ${tone}`}
    >
      {label}
    </span>
  );
}

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

  const [msgs, card, reach] = await Promise.all([
    threadMessages(threadId),
    collarCard(thread.userId),
    subjectReach(thread.userId),
  ]);
  const flagged = msgs.some((m) => m.flaggedSafety && !m.readAt);
  // What became of the push each of her messages fired — one batched lookup.
  const pushes = await reachFor(
    msgs.map((m) => m.pushNotificationId).filter((id): id is string => Boolean(id)),
  );

  return (
    <div className="grid max-w-4xl gap-6 md:grid-cols-[1fr_260px]">
      <div>
        <Link
          href="/sanctum/messages"
          className="text-xs uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold"
        >
          ← All threads
        </Link>
        {/* Her name opens who they are — she should never have to hunt for the
            person she's answering. */}
        <Link href={`/sanctum/subjects/${thread.userId}`} className="block">
          <Display className="mt-1 text-2xl transition-colors hover:text-gold">
            {card?.chosenName ?? "subject"}
          </Display>
        </Link>
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
                {/* What she was answering — an ask, quoted so the reply never
                    lands without its context. */}
                {m.contextNote ? (
                  <p className="mb-1.5 border-l-2 border-gold/40 pl-2 text-xs italic text-text-dim">
                    {m.contextNote}
                  </p>
                ) : null}
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
                <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {/* Two different truths, both shown: whether the push reached
                      their phone, and whether they actually read the words. */}
                  <PushReceipt
                    reach={m.pushNotificationId ? pushes.get(m.pushNotificationId) : undefined}
                  />
                  <span className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim/70">
                    {m.readAt ? (
                      <span className="text-gold/80">
                        Read {formatWhen(m.readAt)}
                      </span>
                    ) : (
                      "Not yet read"
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
          <div className="flex items-center justify-between gap-2">
            <Whisper className="text-xs uppercase tracking-wide">Collar</Whisper>
            <Link
              href={`/sanctum/subjects/${thread.userId}`}
              className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold"
            >
              Full profile →
            </Link>
          </div>
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

        {/* Whether she can reach them at all — the thing that makes every
            "why hasn't he answered" answerable. */}
        <Card>
          <Whisper className="text-xs uppercase tracking-wide">Reach</Whisper>
          <div className="mt-2 space-y-1 text-sm">
            <p className={reach.pushEnabled > 0 ? "text-text" : "text-danger"}>
              {reach.pushEnabled > 0
                ? `${reach.pushEnabled} device${reach.pushEnabled === 1 ? "" : "s"} can be reached`
                : reach.devices > 0
                  ? "App installed — notifications OFF"
                  : "No device — you cannot reach them"}
            </p>
            <p className="text-text-dim">
              {reach.delivered}/{reach.sent} pushes landed · {reach.opened} opened
            </p>
            {reach.lastOpenedAt ? (
              <p className="text-text-dim">
                Last opened one {formatWhen(reach.lastOpenedAt)}
              </p>
            ) : null}
            {reach.lastSeenAt ? (
              <p className="text-text-dim">
                Last on the app {formatWhen(reach.lastSeenAt)}
              </p>
            ) : null}
            <Link
              href={`/sanctum/subjects/${thread.userId}#reach`}
              className="inline-block pt-1 text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold"
            >
              Every notification →
            </Link>
          </div>
        </Card>
      </aside>
    </div>
  );
}
