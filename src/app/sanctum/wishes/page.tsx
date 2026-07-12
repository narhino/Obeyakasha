import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wishes } from "@/lib/db/schema";
import { Badge, Button, Card, Display, Select, Whisper } from "@/components/ui";
import { setWishStatus } from "./actions";

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
      <Display className="text-3xl">Wishes</Display>
      <Whisper className="mt-1">
        What they crave — a demand-ranked roadmap. Ship one and they&apos;ll know.
      </Whisper>

      <div className="mt-6 space-y-2">
        {rows.length === 0 ? (
          <Card>
            <Whisper>No wishes yet.</Whisper>
          </Card>
        ) : (
          rows.map(({ w, name }) => (
            <Card key={w.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm text-text">{w.body}</p>
                <Whisper className="text-xs">
                  {name ?? "someone"} · {w.source}
                </Whisper>
              </div>
              <div className="flex items-center gap-2">
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
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
