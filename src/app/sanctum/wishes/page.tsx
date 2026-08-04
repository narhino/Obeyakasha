import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { threads, users, wishes } from "@/lib/db/schema";
import { Badge, Button, Card, PageHeading, Select, Whisper } from "@/components/ui";
import { replyToWish, setWishStatus } from "./actions";

const STATUSES = ["new", "planned", "shipped", "declined"];

export default async function SanctumWishes() {
  const rows = await db
    .select({
      w: wishes,
      name: users.chosenName,
    })
    .from(wishes)
    .innerJoin(users, eq(users.id, wishes.userId))
    .orderBy(desc(wishes.createdAt))
    .limit(100);

  // Answered asks continue in Messages; map each subject to their thread so the
  // card can link straight there (no thread yet = nothing answered yet).
  const answeredUserIds = [
    ...new Set(rows.filter((r) => r.w.reply).map((r) => r.w.userId)),
  ];
  const threadRows = answeredUserIds.length
    ? await db
        .select({ id: threads.id, userId: threads.userId })
        .from(threads)
        .where(inArray(threads.userId, answeredUserIds))
    : [];
  const threadByUser = new Map(threadRows.map((t) => [t.userId, t.id]));

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="Duties">Asks</PageHeading>
      <Whisper className="mt-1">
        What they crave — a demand-ranked roadmap. Answer one and only that
        subject hears back.
      </Whisper>

      {/* The other job this board serves: sitting down to write the next file
          and wanting every craving in front of you, in their words. */}
      <Card className="mt-4">
        <Whisper className="text-xs uppercase tracking-wide">
          Write the next one from these
        </Whisper>
        <Whisper className="mt-1 text-xs">
          Every ask in one document — verbatim, in their words, grouped the way
          you grouped them, with what&apos;s already in the library so nothing
          gets proposed twice. A prompt at the top turns it into script briefs.
        </Whisper>
        <div className="mt-3">
          <a href="/api/sanctum/asks-export" download>
            <Button size="sm" variant="gold">
              Download every ask
            </Button>
          </a>
        </div>
      </Card>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <Card>
            <Whisper>No wishes yet.</Whisper>
          </Card>
        ) : (
          rows.map(({ w, name }) => (
            // `#u-<userId>` is where the subject profile's "Their asks" link
            // lands. Scroll margin clears the sticky header.
            <Card key={w.id} id={`u-${w.userId}`} className="scroll-mt-24 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {w.title ? (
                    <p className="font-[family-name:var(--font-display)] text-lg text-text">
                      {w.title}
                    </p>
                  ) : null}
                  <p className="text-sm text-text">{w.body}</p>
                  <Whisper className="mt-1 text-xs">
                    <Link
                      href={`/sanctum/subjects/${w.userId}`}
                      className="transition-colors hover:text-gold"
                    >
                      {name ?? "someone"}
                    </Link>{" "}
                    · {w.source}
                  </Whisper>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={w.status === "shipped" ? "gold" : "neutral"}>
                    {w.status}
                  </Badge>
                  <form action={setWishStatus} className="flex items-center gap-1">
                    <input type="hidden" name="wishId" value={w.id} />
                    <Select name="status" defaultValue={w.status}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" size="sm" variant="ghost">
                      Set
                    </Button>
                  </form>
                </div>
              </div>

              {w.reply ? (
                <div className="mt-3 border-l-2 border-gold/40 pl-3">
                  <p className="text-[0.6875rem] uppercase tracking-[0.14em] text-gold">
                    Your answer
                  </p>
                  <p className="mt-1 text-sm text-text">{w.reply}</p>
                  {/* Answering opens a real thread — this is where the rest of
                      it happens, so the board is never the end of the road. */}
                  <Link
                    href={`/sanctum/messages/${threadByUser.get(w.userId) ?? ""}`}
                    className="mt-1 inline-block text-[0.6875rem] uppercase tracking-[0.14em] text-text-dim transition-colors hover:text-gold"
                  >
                    Continue in Messages →
                  </Link>
                </div>
              ) : null}

              <form action={replyToWish} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="wishId" value={w.id} />
                <textarea
                  name="reply"
                  rows={2}
                  maxLength={1000}
                  required
                  defaultValue={w.reply ?? ""}
                  placeholder={w.reply ? "Revise your answer…" : "Answer this petition…"}
                  className="w-full rounded-[var(--radius)] border border-line bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-text-dim/45 transition-colors duration-[var(--dur-med)] focus:border-gold/70 focus:outline-none"
                />
                <div>
                  <Button type="submit" size="sm" variant="gold">
                    {w.reply ? "Send revised answer" : "Answer & notify"}
                  </Button>
                </div>
              </form>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
