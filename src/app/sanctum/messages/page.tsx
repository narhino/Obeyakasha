import Link from "next/link";
import { inboxThreads } from "@/lib/messages/ops";
import { Badge, Card, PageHeading, Whisper } from "@/components/ui";
import { formatWhen } from "@/lib/format/when";

export default async function SanctumMessages() {
  const threads = await inboxThreads();
  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="People">Messages</PageHeading>
      <Whisper className="mt-1">
        Flagged first, then unread. Their profile sits beside every thread.
      </Whisper>

      <div className="mt-6 space-y-2">
        {threads.length === 0 ? (
          <Card>
            <Whisper>No one has written yet.</Whisper>
          </Card>
        ) : (
          threads.map((t) => (
            // Two doors per row, and neither is nested inside the other: the
            // body opens the conversation, the name opens the person.
            <Card
              key={t.threadId}
              className={`flex items-center justify-between gap-3 py-3 ${
                t.flagged ? "border-danger/60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/sanctum/subjects/${t.userId}`}
                    className="text-sm text-text transition-colors hover:text-gold"
                  >
                    {t.name}
                  </Link>
                  <span
                    className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/60"
                    suppressHydrationWarning
                  >
                    {t.last.createdAt ? formatWhen(t.last.createdAt) : ""}
                  </span>
                  {t.flagged ? (
                    <span className="text-xs text-danger">handle personally</span>
                  ) : null}
                </div>
                <Link
                  href={`/sanctum/messages/${t.threadId}`}
                  className="block transition-colors hover:text-text"
                >
                  <Whisper className="truncate text-xs">
                    {t.last.sender === "goddess" ? "you: " : ""}
                    {t.last.body}
                  </Whisper>
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.unread > 0 ? <Badge tone="gold">{t.unread}</Badge> : null}
                <Link
                  href={`/sanctum/messages/${t.threadId}`}
                  className="text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold"
                >
                  Open →
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
