import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, whispers } from "@/lib/db/schema";
import { whisperStats } from "@/lib/feed/whispers";
import { listOpenPolls } from "@/lib/polls/ops";
import { Badge, Button, Card, Display, Whisper } from "@/components/ui";
import { WhisperComposer } from "./WhisperComposer";
import { cancelScheduledWhisper, setWhisperPinned } from "./actions";

/** Admin-facing when-label for a scheduled whisper (server-rendered only). */
function whenLabel(d: Date): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SanctumWhispers() {
  const [subjects, recent, openPolls] = await Promise.all([
    db
      .select({ id: users.id, name: users.chosenName, email: users.email })
      .from(users)
      .where(eq(users.role, "subject"))
      .limit(200),
    db
      .select()
      .from(whispers)
      .orderBy(desc(whispers.pinned), desc(whispers.publishedAt))
      .limit(15),
    listOpenPolls(),
  ]);
  const stats = await Promise.all(recent.map((w) => whisperStats(w.id)));

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Whispers</Display>
      <Whisper className="mt-1">
        A one-way drop only you can post to. They can only kneel.
      </Whisper>

      <Card className="mt-6">
        <WhisperComposer
          subjects={subjects.map((s) => ({
            id: s.id,
            name: s.name,
            email: s.email,
          }))}
          openPolls={openPolls.map((p) => ({ id: p.id, question: p.question }))}
        />
      </Card>

      <div className="mt-8 space-y-2">
        {recent.map((w, i) => {
          const scheduled = !w.publishedAt && w.scheduledFor;
          return (
            <Card key={w.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  {w.body ?? (w.pollId ? "— poll —" : "")}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {w.pinned ? <Badge tone="gold">Pinned</Badge> : null}
                  {w.pollId ? <Badge tone="neutral">Poll</Badge> : null}
                  {scheduled ? (
                    <Badge tone="sealed">
                      scheduled · {whenLabel(w.scheduledFor!)}
                    </Badge>
                  ) : (
                    <>
                      <Badge tone="neutral">{stats[i]!.seen} seen</Badge>
                      <Badge tone="gold">{stats[i]!.knelt} knelt</Badge>
                    </>
                  )}
                </div>
              </div>
              {scheduled ? (
                <form action={cancelScheduledWhisper}>
                  <input type="hidden" name="whisperId" value={w.id} />
                  <Button type="submit" size="sm" variant="danger">
                    Cancel
                  </Button>
                </form>
              ) : (
                <form action={setWhisperPinned}>
                  <input type="hidden" name="whisperId" value={w.id} />
                  <input
                    type="hidden"
                    name="pinned"
                    value={w.pinned ? "false" : "true"}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant={w.pinned ? "ghost" : "gold"}
                  >
                    {w.pinned ? "Unpin" : "Pin"}
                  </Button>
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
