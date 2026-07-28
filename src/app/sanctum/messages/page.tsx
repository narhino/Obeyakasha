import Link from "next/link";
import { inboxThreads } from "@/lib/messages/ops";
import { Badge, Card, PageHeading, Whisper } from "@/components/ui";
import { formatWhen } from "@/lib/format/when";

export const dynamic = "force-dynamic";

export default async function SanctumMessages() {
  const threads = await inboxThreads();
  const unread = threads.filter((t) => t.state === "unread").length;
  const unreplied = threads.filter((t) => t.state === "unreplied").length;

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="People">Messages</PageHeading>
      <Whisper className="mt-1">
        Newest first.{" "}
        <span className="text-danger">Red</span> is unread,{" "}
        <span className="text-gold">gold</span> is read but still owed an
        answer.
      </Whisper>
      {unread + unreplied > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {unread > 0 ? <Badge tone="danger">{unread} unread</Badge> : null}
          {unreplied > 0 ? (
            <Badge tone="gold">{unreplied} awaiting your answer</Badge>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        {threads.length === 0 ? (
          <Card>
            <Whisper>No one has written yet.</Whisper>
          </Card>
        ) : (
          threads.map((t) => {
            // The WHOLE card is the link — a row you have to hit a small word
            // inside of is a row you miss on a phone.
            const edge =
              t.state === "unread"
                ? "border-danger/70 bg-danger/[0.06]"
                : t.state === "unreplied"
                  ? "border-gold/60 bg-gold/[0.05]"
                  : "border-line/80";
            return (
              <Link
                key={t.threadId}
                href={`/sanctum/messages/${t.threadId}`}
                className="block"
              >
                <Card
                  className={`flex items-center justify-between gap-3 py-3 transition-colors duration-[var(--dur-med)] hover:border-gold ${edge}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {/* A dot, not just a tint: colour alone is not a signal
                          everyone can read. */}
                      <span
                        aria-hidden
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                          t.state === "unread"
                            ? "bg-danger"
                            : t.state === "unreplied"
                              ? "bg-gold"
                              : "bg-transparent"
                        }`}
                      />
                      <span className="text-sm text-text">{t.name}</span>
                      <span
                        className="text-[0.6875rem] uppercase tracking-[0.12em] text-text-dim/60"
                        suppressHydrationWarning
                      >
                        {t.last.createdAt ? formatWhen(t.last.createdAt) : ""}
                      </span>
                      {t.flagged ? (
                        <span className="text-xs text-danger">
                          handle personally
                        </span>
                      ) : null}
                    </div>
                    <Whisper className="mt-0.5 truncate text-xs">
                      {t.last.sender === "goddess" ? "you: " : ""}
                      {t.last.body}
                    </Whisper>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.state === "unread" ? (
                      <Badge tone="danger">
                        {t.unread > 1 ? `${t.unread} new` : "new"}
                      </Badge>
                    ) : t.state === "unreplied" ? (
                      <Badge tone="gold">awaiting you</Badge>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      {/* The name is no longer its own link (a link inside a link is invalid
          HTML and the browser drops the inner one), so the way to a profile is
          stated once here instead of silently failing on every row. */}
      <Whisper className="mt-4 text-xs">
        Open a conversation to reach their full profile from inside it.
      </Whisper>
    </div>
  );
}
