import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, whispers } from "@/lib/db/schema";
import { whisperStats } from "@/lib/feed/whispers";
import { listOpenPolls } from "@/lib/polls/ops";
import {
  Badge,
  Button,
  Card,
  Display,
  Input,
  Select,
  Whisper,
} from "@/components/ui";
import { publishWhisper, setWhisperPinned } from "./actions";

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
        <form action={publishWhisper} className="space-y-3">
          <textarea
            name="body"
            maxLength={500}
            rows={3}
            placeholder="Say it… (optional if you attach a poll)"
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select name="audienceType" defaultValue="all">
              <option value="public">Public (logged-out too)</option>
              <option value="all">Everyone signed in</option>
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

          {/* Poll attach — none · an existing open poll · a fresh inline poll. */}
          <fieldset className="space-y-3 rounded-[var(--radius)] border border-line/70 p-3">
            <legend className="label-caps px-1 text-text-dim">Poll</legend>
            <Select name="pollMode" defaultValue="none">
              <option value="none">No poll</option>
              <option value="existing">Attach an open poll</option>
              <option value="new">Create a quick poll</option>
            </Select>
            <Select name="existingPollId" defaultValue="">
              <option value="">— pick an open poll —</option>
              {openPolls.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.question}
                </option>
              ))}
            </Select>
            <Input
              name="pollQuestion"
              maxLength={200}
              placeholder="Quick poll question"
              className="w-full"
            />
            <textarea
              name="pollOptions"
              rows={3}
              placeholder={"One option per line (2–6)\ne.g. A chastity file\nA doll transformation"}
              className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
            />
          </fieldset>

          <Button type="submit" variant="gold">
            Whisper
          </Button>
        </form>
      </Card>

      <div className="mt-8 space-y-2">
        {recent.map((w, i) => (
          <Card key={w.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text">
                {w.body ?? (w.pollId ? "— poll —" : "")}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {w.pinned ? <Badge tone="gold">Pinned</Badge> : null}
                {w.pollId ? <Badge tone="neutral">Poll</Badge> : null}
                <Badge tone="neutral">{stats[i]!.seen} seen</Badge>
                <Badge tone="gold">{stats[i]!.knelt} knelt</Badge>
              </div>
            </div>
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
          </Card>
        ))}
      </div>
    </div>
  );
}
