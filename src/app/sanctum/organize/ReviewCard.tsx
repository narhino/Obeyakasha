"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Whisper } from "@/components/ui";
import { copy } from "@/copy/copy";
import type { OrganizeProposal } from "@/lib/organize/types";
import { approveReviewAction, rejectReviewAction } from "./actions";

// One token-only textarea look for the trigger edit fields (never a raw colour).
const TEXTAREA =
  "w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/45 focus:border-gold/70 focus:outline-none";

/**
 * A pending organize proposal, hers to complete before approving. Tags and
 * playlists show read-only (approval doesn't regress them); each proposed TRIGGER
 * renders EDITABLE — name / what-it-does / care-it-asks, pre-filled with the
 * reading's values, the evidence phrase read-only for context. Approving folds
 * her edits into the materialised triggers; Reject is unchanged.
 */
export function ReviewCard({
  reviewId,
  title,
  rationale,
  proposal,
}: {
  reviewId: string;
  title: string;
  rationale: string | null;
  proposal: OrganizeProposal;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const formId = `review-${reviewId}`;

  const approve = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const data = new FormData(e.currentTarget);
    const edits = (proposal.triggers ?? []).map((t, i) => ({
      originalName: t.name,
      name: String(data.get(`t-${i}-name`) ?? t.name),
      description: String(data.get(`t-${i}-description`) ?? ""),
      safetyNotes: String(data.get(`t-${i}-safety`) ?? ""),
    }));
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    if (edits.length > 0) fd.set("editedTriggers", JSON.stringify(edits));
    try {
      await approveReviewAction(fd);
      router.refresh();
    } catch {
      setPending(false); // keep it here so she can try again
    }
  };

  return (
    <Card raised>
      <p className="font-[family-name:var(--font-display)] text-lg">{title}</p>
      <Whisper className="text-xs">{rationale}</Whisper>

      {proposal.tags?.length ? (
        <div className="mt-3">
          <Whisper className="text-xs uppercase tracking-wide">Tags</Whisper>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {proposal.tags.map((t, i) => (
              <Badge key={i} tone="neutral">
                {t.kind}: {t.value}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <form id={formId} onSubmit={approve}>
        {proposal.triggers?.length ? (
          <div className="mt-3">
            <Whisper className="text-xs uppercase tracking-wide">
              {copy.sanctum.triggers.title}
            </Whisper>
            <Whisper className="mt-1 text-xs">
              {copy.sanctum.triggers.intro}
            </Whisper>
            <div className="mt-2 space-y-3">
              {proposal.triggers.map((t, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius)] border border-line/70 bg-bg/30 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-[family-name:var(--font-display)] text-sm text-text">
                      {t.name}
                    </span>
                    <Badge tone="neutral">{t.relation}</Badge>
                  </div>
                  {t.evidence?.[0]?.phrase ? (
                    <p className="mt-1.5 text-xs italic text-text-dim/70">
                      &ldquo;{t.evidence[0].phrase.slice(0, 120)}&rdquo;
                    </p>
                  ) : null}
                  <label className="mt-2 flex flex-col gap-1 text-xs text-text-dim">
                    {copy.sanctum.triggers.nameLabel}
                    <Input name={`t-${i}-name`} defaultValue={t.name} required />
                  </label>
                  <label className="mt-2 flex flex-col gap-1 text-xs text-text-dim">
                    {copy.sanctum.triggers.descriptionLabel}
                    <textarea
                      name={`t-${i}-description`}
                      rows={2}
                      defaultValue=""
                      placeholder={copy.sanctum.triggers.descriptionPlaceholder}
                      className={TEXTAREA}
                    />
                  </label>
                  <label className="mt-2 flex flex-col gap-1 text-xs text-text-dim">
                    {copy.sanctum.triggers.safetyLabel}
                    <textarea
                      name={`t-${i}-safety`}
                      rows={2}
                      defaultValue=""
                      placeholder={copy.sanctum.triggers.safetyPlaceholder}
                      className={TEXTAREA}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {proposal.playlists?.length ? (
          <div className="mt-3">
            <Whisper className="text-xs uppercase tracking-wide">
              Playlists
            </Whisper>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {proposal.playlists.map((pl, i) => (
                <Badge key={i} tone="gold">
                  {pl.target}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </form>

      <div className="mt-4 flex gap-2">
        <Button
          type="submit"
          form={formId}
          size="sm"
          variant="gold"
          loading={pending}
        >
          {copy.sanctum.triggers.approve}
        </Button>
        <form action={rejectReviewAction}>
          <input type="hidden" name="reviewId" value={reviewId} />
          <Button type="submit" size="sm" variant="ghost" disabled={pending}>
            Reject
          </Button>
        </form>
      </div>
    </Card>
  );
}
