import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reviewQueue } from "@/lib/db/schema";
import { llmConfigured } from "@/lib/llm/organize";
import { Badge, Button, Card, PageHeading, Whisper } from "@/components/ui";
import type { OrganizeProposal } from "@/lib/organize/types";
import {
  approveReviewAction,
  organizeAllAction,
  rejectReviewAction,
} from "./actions";

export default async function OrganizePage() {
  const pending = await db
    .select()
    .from(reviewQueue)
    .where(eq(reviewQueue.status, "pending"))
    .orderBy(desc(reviewQueue.createdAt))
    .limit(50);

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="Catalog">Review</PageHeading>
      <Whisper className="mt-1">
        The agent reads each transcript and proposes tags, triggers, and
        playlists. Nothing applies until you approve it.
      </Whisper>
      <Whisper className="mt-1 text-xs">
        AI depth: {llmConfigured() ? "heuristics + LLM" : "heuristics only (add an LLM key to deepen)"}.
      </Whisper>

      <form action={organizeAllAction} className="mt-4">
        <Button type="submit" variant="gold">
          Organize all transcribed tracks
        </Button>
      </form>

      <div className="mt-6 space-y-4">
        {pending.length === 0 ? (
          <Card>
            <Whisper>Nothing waiting for review.</Whisper>
          </Card>
        ) : (
          pending.map((row) => {
            const ref = row.subjectRef as { trackId?: string; title?: string };
            const p = row.proposal as OrganizeProposal;
            return (
              <Card key={row.id} raised>
                <p className="font-[family-name:var(--font-display)] text-lg">
                  {ref?.title ?? "Track"}
                </p>
                <Whisper className="text-xs">{row.agentRationale}</Whisper>

                {p.tags?.length ? (
                  <div className="mt-3">
                    <Whisper className="text-xs uppercase tracking-wide">Tags</Whisper>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.tags.map((t, i) => (
                        <Badge key={i} tone="neutral">
                          {t.kind}: {t.value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {p.triggers?.length ? (
                  <div className="mt-3">
                    <Whisper className="text-xs uppercase tracking-wide">
                      Triggers
                    </Whisper>
                    <ul className="mt-1 space-y-1">
                      {p.triggers.map((t, i) => (
                        <li key={i} className="text-sm text-text">
                          <span className="text-gold">{t.name}</span>{" "}
                          <span className="text-text-dim">({t.relation})</span>
                          {t.evidence?.[0] ? (
                            <span className="block text-xs text-text-dim/70">
                              &ldquo;{t.evidence[0].phrase.slice(0, 80)}&rdquo;
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {p.playlists?.length ? (
                  <div className="mt-3">
                    <Whisper className="text-xs uppercase tracking-wide">
                      Playlists
                    </Whisper>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.playlists.map((pl, i) => (
                        <Badge key={i} tone="gold">
                          {pl.target}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex gap-2">
                  <form action={approveReviewAction}>
                    <input type="hidden" name="reviewId" value={row.id} />
                    <Button type="submit" size="sm" variant="gold">
                      Approve
                    </Button>
                  </form>
                  <form action={rejectReviewAction}>
                    <input type="hidden" name="reviewId" value={row.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Reject
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
