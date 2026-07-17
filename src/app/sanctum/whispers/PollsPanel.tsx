import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls } from "@/lib/db/schema";
import { pollResults } from "@/lib/polls/ops";
import { Badge, Button, Card, Input, Label, Select, Whisper } from "@/components/ui";
import type { PollOption } from "@/lib/polls/tally";
import {
  closePollAction,
  createPoll,
  shareResultsAction,
} from "../polls/actions";

/**
 * Polls management, moved out of the standalone /sanctum/polls tab into a
 * section beneath the Whispers composer (R-organize). Create, watch results,
 * close, share. Poll actions still live under ../polls/actions.
 */
export async function PollsPanel() {
  const all = await db.select().from(polls).orderBy(desc(polls.createdAt)).limit(20);
  const results = await Promise.all(all.map((p) => pollResults(p.id)));

  return (
    <section className="mt-10">
      <Label>Polls</Label>
      <Whisper className="mt-1">
        Ask them to choose. The winner comes back to you — share it if you like.
      </Whisper>

      <Card className="mt-4">
        <form action={createPoll} className="space-y-3">
          <Input name="question" required placeholder="What should I make next?" className="w-full" />
          <textarea
            name="options"
            required
            rows={4}
            placeholder={"One option per line\ne.g. A chastity file\nA doll transformation"}
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select name="audienceType" defaultValue="all">
              <option value="all">Everyone</option>
              <option value="level">Access level ≥</option>
            </Select>
            <Input name="level" type="number" min={0} max={99} defaultValue={1} className="w-24" />
            <label className="flex items-center gap-2 text-sm text-text-dim">
              <input type="checkbox" name="anonymous" /> anonymous to me
            </label>
          </div>
          <Button type="submit" variant="gold">
            Ask
          </Button>
        </form>
      </Card>

      <div className="mt-6 space-y-4">
        {all.map((p, i) => {
          const res = results[i];
          const opts = p.options as PollOption[];
          return (
            <Card key={p.id} raised>
              <div className="flex items-center justify-between gap-2">
                <p className="font-[family-name:var(--font-display)] text-lg">
                  {p.question}
                </p>
                <Badge tone={p.status === "open" ? "gold" : "neutral"}>
                  {p.status}
                </Badge>
              </div>
              <ul className="mt-3 space-y-1">
                {opts.map((o) => {
                  const r = res?.results.find((x) => x.optionId === o.id);
                  return (
                    <li key={o.id} className="text-sm">
                      <div className="flex justify-between">
                        <span className="text-text">{o.label}</span>
                        <span className="text-text-dim">
                          {r?.count ?? 0} · {r?.pct ?? 0}%
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 rounded bg-line">
                        <div
                          className="h-full rounded bg-gold"
                          style={{ width: `${r?.pct ?? 0}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Whisper className="mt-2 text-xs">{res?.total ?? 0} votes</Whisper>
              <div className="mt-3 flex gap-2">
                {p.status === "open" ? (
                  <form action={closePollAction}>
                    <input type="hidden" name="pollId" value={p.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Close
                    </Button>
                  </form>
                ) : null}
                {!p.resultsShared ? (
                  <form action={shareResultsAction}>
                    <input type="hidden" name="pollId" value={p.id} />
                    <Button type="submit" size="sm" variant="gold">
                      Share results
                    </Button>
                  </form>
                ) : (
                  <Badge tone="gold">shared</Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
