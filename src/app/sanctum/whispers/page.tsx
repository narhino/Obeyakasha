import Link from "next/link";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { WhispersFeed } from "@/components/whispers/WhispersFeed";
import { tracks, users, whispers } from "@/lib/db/schema";
import { whisperStats, whispersForSubject } from "@/lib/feed/whispers";
import { loveCountsFor } from "@/lib/feed/loves";
import { unreadCommentCountsFor } from "@/lib/feed/comments";
import { listOpenPolls } from "@/lib/polls/ops";
import { Badge, Button, Card, Label, PageHeading, Whisper } from "@/components/ui";
import { WhisperComposer } from "./WhisperComposer";
import { PollsPanel } from "./PollsPanel";
import {
  cancelScheduledWhisper,
  deleteWhisper,
  setWhisperPinned,
} from "./actions";
import { ConfirmDelete } from "../ConfirmDelete";
import { copy } from "@/copy/copy";

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
  const [subjects, recent, openPolls, attachable] = await Promise.all([
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
    // Only the live catalog can be pinned to a whisper — never a draft and
    // never a subject's private upload (D7).
    db
      .select({
        id: tracks.id,
        title: tracks.title,
        minAccessLevel: tracks.minAccessLevel,
        freeSample: tracks.freeSample,
      })
      .from(tracks)
      .where(and(isNotNull(tracks.publishedAt), isNull(tracks.ownerUserId)))
      .orderBy(desc(tracks.publishedAt))
      .limit(200),
  ]);
  // What it actually looks like out there. She was only ever shown truncated
  // one-liners of her own voice; this is the feed as her subjects read it.
  const session = await auth();
  const feed = session?.user
    ? await whispersForSubject(session.user.id, 999, true).catch(() => [])
    : [];
  const whisperIds = recent.map((w) => w.id);
  const [stats, loveCounts, unreadComments] = await Promise.all([
    Promise.all(recent.map((w) => whisperStats(w.id))),
    loveCountsFor(whisperIds),
    unreadCommentCountsFor(whisperIds),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="Voice">Whispers</PageHeading>
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
          tracks={attachable}
        />
      </Card>

      {/* Her feed, as they see it — the same component the subject app renders,
          so what she reads here is exactly what lands out there. */}
      {feed.length > 0 ? (
        <div className="mt-10">
          <Label className="block">Your feed, as they see it</Label>
          <WhispersFeed items={feed} signedIn preview />
        </div>
      ) : null}

      <Label className="mt-10 block">Every whisper — pin, count, take back</Label>
      <div className="mt-3 space-y-2">
        {recent.map((w, i) => {
          const scheduled = !w.publishedAt && w.scheduledFor;
          return (
            <Card key={w.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  {w.body ?? (w.pollId ? "— poll —" : "")}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
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
                      <Badge tone="neutral">
                        {loveCounts.get(w.id) ?? 0} surrendered
                      </Badge>
                      <Link
                        href={`/sanctum/whispers/${w.id}`}
                        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-text-dim transition-colors hover:text-gold"
                      >
                        Comments
                        {(unreadComments.get(w.id) ?? 0) > 0 ? (
                          <Badge tone="gold">{unreadComments.get(w.id)}</Badge>
                        ) : null}
                      </Link>
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
                <div className="flex shrink-0 items-center gap-2">
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
                  {/* A whisper can't be edited — sent to the wrong audience,
                      the fix is to take it back and speak again. */}
                  <ConfirmDelete
                    action={deleteWhisper}
                    fields={{ whisperId: w.id }}
                    warn={copy.sanctum.delete.warnWhisper}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <PollsPanel />
    </div>
  );
}
