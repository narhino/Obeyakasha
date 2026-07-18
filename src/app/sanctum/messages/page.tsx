import Link from "next/link";
import { inboxThreads } from "@/lib/messages/ops";
import { Badge, Card, PageHeading, Whisper } from "@/components/ui";

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
            <Link key={t.threadId} href={`/sanctum/messages/${t.threadId}`}>
              <Card
                className={`flex items-center justify-between py-3 ${
                  t.flagged ? "border-danger/60" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm text-text">
                    {t.name}
                    {t.flagged ? (
                      <span className="ml-2 text-xs text-danger">
                        handle personally
                      </span>
                    ) : null}
                  </p>
                  <Whisper className="truncate text-xs">
                    {t.last.sender === "goddess" ? "you: " : ""}
                    {t.last.body}
                  </Whisper>
                </div>
                {t.unread > 0 ? (
                  <Badge tone="gold">{t.unread}</Badge>
                ) : null}
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
