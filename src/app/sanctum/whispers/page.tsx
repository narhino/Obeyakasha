import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, whispers } from "@/lib/db/schema";
import { whisperStats } from "@/lib/feed/whispers";
import { Badge, Button, Card, Display, Input, Select, Whisper } from "@/components/ui";
import { publishWhisper } from "./actions";

export default async function SanctumWhispers() {
  const [subjects, recent] = await Promise.all([
    db
      .select({ id: users.id, name: users.chosenName, email: users.email })
      .from(users)
      .where(eq(users.role, "subject"))
      .limit(200),
    db.select().from(whispers).orderBy(desc(whispers.publishedAt)).limit(15),
  ]);
  const stats = await Promise.all(recent.map((w) => whisperStats(w.id)));

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Whispers</Display>
      <Whisper className="mt-1">
        A one-way drop only you can post to. They can only kneel.
      </Whisper>

      <Card className="mt-6">
        <form action={publishWhisper} className="space-y-3">
          <textarea
            name="body"
            required
            maxLength={500}
            rows={3}
            placeholder="Say it…"
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select name="audienceType" defaultValue="all">
              <option value="all">Everyone</option>
              <option value="level">Access level ≥</option>
              <option value="user">One subject</option>
            </Select>
            <Input name="level" type="number" min={0} max={99} defaultValue={1} />
            <Select name="userId">
              <option value="">—</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email ?? s.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="gold">
            Whisper
          </Button>
        </form>
      </Card>

      <div className="mt-8 space-y-2">
        {recent.map((w, i) => (
          <Card key={w.id} className="flex items-center justify-between py-3">
            <p className="min-w-0 flex-1 truncate text-sm text-text">{w.body}</p>
            <div className="ml-3 flex gap-2">
              <Badge tone="neutral">{stats[i]!.seen} seen</Badge>
              <Badge tone="gold">{stats[i]!.knelt} knelt</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
