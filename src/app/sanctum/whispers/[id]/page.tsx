import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls, tracks, users, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { resolveTrackCover, signArtwork } from "@/lib/art/resolve";
import {
  markCommentsRead,
  whisperCommentsAdmin,
} from "@/lib/feed/comments";
import { loveCount } from "@/lib/feed/loves";
import { requireGoddess } from "@/lib/auth-helpers";
import { formatWhen } from "@/lib/format/when";
import {
  Badge,
  Button,
  Card,
  Label,
  PageHeading,
  Voice,
  Whisper,
} from "@/components/ui";
import {
  deleteWhisperComment,
  replyToWhisperComment,
} from "../actions";
import { WhisperEditor, type EditorTrack } from "./WhisperEditor";

// Counts + comments are live; never serve a stale shell.
export const dynamic = "force-dynamic";

/** Per-whisper oversight (F3): every comment on one whisper, subject named,
 *  marked read on view, each with an inline reply (→ messages path) + delete. */
export default async function SanctumWhisperComments({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireGoddess();
  const { id } = await params;

  const [whisper] = await db
    .select()
    .from(whispers)
    .where(eq(whispers.id, id))
    .limit(1);
  if (!whisper) notFound();

  // Load the comments (with their pre-view read state), then stamp them read so
  // the nav badge / Today clear — this view still highlights what was new.
  const [comments, loves] = await Promise.all([
    whisperCommentsAdmin(id),
    loveCount(id),
  ]);
  const wasUnread = new Set(
    comments.filter((c) => c.readAt === null).map((c) => c.id),
  );
  await markCommentsRead(id);

  let pollQuestion: string | null = null;
  if (whisper.pollId) {
    const [p] = await db
      .select({ question: polls.question })
      .from(polls)
      .where(eq(polls.id, whisper.pollId))
      .limit(1);
    pollQuestion = p?.question ?? null;
  }
  const heading = whisper.body ?? pollQuestion ?? "—";

  // Everything the editor needs: who she can aim it at, which files she can
  // point it at (live catalog only — never a draft, never a subject's private
  // upload, D7), and the picture as it stands.
  const [subjects, attachable, imageUrl] = await Promise.all([
    db
      .select({ id: users.id, name: users.chosenName, email: users.email })
      .from(users)
      .where(eq(users.role, "subject"))
      .limit(200),
    db
      .select({
        id: tracks.id,
        title: tracks.title,
        slug: tracks.slug,
        durationS: tracks.durationS,
        artworkKey: tracks.artworkKey,
        minAccessLevel: tracks.minAccessLevel,
        freeSample: tracks.freeSample,
      })
      .from(tracks)
      .where(and(isNotNull(tracks.publishedAt), isNull(tracks.ownerUserId)))
      .orderBy(desc(tracks.publishedAt))
      .limit(120),
    signArtwork(whisper.imageKey),
  ]);
  const editorTracks: EditorTrack[] = await Promise.all(
    attachable.map(async (t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      durationS: t.durationS,
      cover: await resolveTrackCover(t.artworkKey, []),
      minAccessLevel: t.minAccessLevel,
      freeSample: t.freeSample,
    })),
  );

  // `segment` has no picker (nothing in the product creates one) — it reads as
  // "All subjects" rather than crashing, and only becomes that if she saves.
  const audience = whisper.audience as Audience;
  const audienceType =
    audience.type === "users"
      ? "user"
      : audience.type === "segment"
        ? "all"
        : audience.type;

  return (
    <div className="max-w-2xl">
      <PageHeading
        eyebrow="Voice · beneath a whisper"
        trailing={
          <Link
            href="/sanctum/whispers"
            className="text-xs uppercase tracking-[0.1em] text-text-dim transition-colors hover:text-gold"
          >
            ← Whispers
          </Link>
        }
      >
        Spoken under
      </PageHeading>

      <Card className="mt-6" raised>
        {whisper.pollId ? <Badge tone="neutral">Poll</Badge> : null}
        <p className="mt-2 font-[family-name:var(--font-display)] text-lg italic leading-relaxed text-text">
          {heading}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="gold">{loves} surrendered</Badge>
          <Badge tone="neutral">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </Badge>
        </div>
      </Card>

      {/* Change it after the fact — words, picture, the file it points at, and
          who can see it — with the card as they read it underneath. */}
      <Card className="mt-6">
        <Label className="block">Change this whisper</Label>
        <Whisper className="mb-3 mt-1 text-xs">
          Saving changes what&apos;s out there. Nobody is woken again.
        </Whisper>
        <WhisperEditor
          whisper={{
            id: whisper.id,
            body: whisper.body,
            imageKey: whisper.imageKey,
            imageUrl,
            imageW: whisper.imageW,
            imageH: whisper.imageH,
            imageFit: whisper.imageFit,
            audienceType,
            audienceLevel:
              audience.type === "level" ? audience.level : 1,
            audienceUserId:
              audience.type === "users" ? audience.userIds[0] ?? "" : "",
            audioTrackId: whisper.audioTrackId,
            pinned: whisper.pinned,
            publishedAt: whisper.publishedAt,
            loveCount: loves,
            hasPoll: Boolean(whisper.pollId),
          }}
          subjects={subjects}
          tracks={editorTracks}
        />
      </Card>

      <div className="mt-6 space-y-3">
        {comments.length === 0 ? (
          <Whisper>No one has spoken under this yet.</Whisper>
        ) : (
          comments.map((c) => (
            <Card key={c.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/sanctum/subjects/${c.userId}`}
                    className="font-[family-name:var(--font-display)] text-base text-text hover:text-gold"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-text-dim">
                    {formatWhen(c.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.reply ? (
                    <Badge tone="gold">Replied</Badge>
                  ) : wasUnread.has(c.id) ? (
                    <Badge tone="gold">New</Badge>
                  ) : (
                    <Badge tone="neutral">Read</Badge>
                  )}
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                {c.body}
              </p>

              {c.reply ? (
                <div className="border-l-2 border-gold/30 pl-3">
                  <p className="label-caps text-gold/70">You replied</p>
                  <Voice className="mt-1 text-sm leading-relaxed">
                    {c.reply}
                  </Voice>
                </div>
              ) : (
                <form action={replyToWhisperComment} className="space-y-2">
                  <input type="hidden" name="commentId" value={c.id} />
                  <input type="hidden" name="whisperId" value={id} />
                  <textarea
                    name="body"
                    rows={2}
                    required
                    placeholder="Answer — lands in their Messages…"
                    className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text focus:border-gold focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" variant="gold">
                      Send to their Messages
                    </Button>
                  </div>
                </form>
              )}

              <form action={deleteWhisperComment}>
                <input type="hidden" name="commentId" value={c.id} />
                <input type="hidden" name="whisperId" value={id} />
                <button
                  type="submit"
                  className="text-[0.6875rem] uppercase tracking-[0.1em] text-text-dim/50 transition-colors hover:text-danger"
                >
                  Take it down
                </button>
              </form>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
