import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wishes } from "@/lib/db/schema";
import { Badge, Button, Card, Display, Select, Whisper } from "@/components/ui";
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

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Asks</Display>
      <Whisper className="mt-1">
        What they crave — a demand-ranked roadmap. Answer one and only that
        subject hears back.
      </Whisper>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <Card>
            <Whisper>No wishes yet.</Whisper>
          </Card>
        ) : (
          rows.map(({ w, name }) => (
            <Card key={w.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {w.title ? (
                    <p className="font-[family-name:var(--font-display)] text-lg text-text">
                      {w.title}
                    </p>
                  ) : null}
                  <p className="text-sm text-text">{w.body}</p>
                  <Whisper className="mt-1 text-xs">
                    {name ?? "someone"} · {w.source}
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
