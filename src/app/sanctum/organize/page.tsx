import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reviewQueue } from "@/lib/db/schema";
import { llmConfigured } from "@/lib/llm/organize";
import { Button, Card, PageHeading, Whisper } from "@/components/ui";
import type { OrganizeProposal } from "@/lib/organize/types";
import { organizeAllAction } from "./actions";
import { ReviewCard } from "./ReviewCard";

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
              <ReviewCard
                key={row.id}
                reviewId={row.id}
                title={ref?.title ?? "Track"}
                rationale={row.agentRationale}
                proposal={p}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
