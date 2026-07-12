import { z } from "zod";

/** Shape of an organize proposal (stored in review_queue.proposal, PLAN §8.3). */
export const tagProposalSchema = z.object({
  kind: z.enum(["purpose", "theme", "format", "intensity", "custom"]),
  value: z.string().min(1).max(60),
});

export const triggerProposalSchema = z.object({
  name: z.string().min(1).max(80),
  relation: z.enum(["installs", "reinforces", "requires"]),
  evidence: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        phrase: z.string(),
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export const playlistProposalSchema = z.object({
  target: z.string().min(1).max(120),
  reason: z.string().optional(),
});

export const organizeProposalSchema = z.object({
  tags: z.array(tagProposalSchema).default([]),
  triggers: z.array(triggerProposalSchema).default([]),
  playlists: z.array(playlistProposalSchema).default([]),
});

export type TagProposal = z.infer<typeof tagProposalSchema>;
export type TriggerProposal = z.infer<typeof triggerProposalSchema>;
export type PlaylistProposal = z.infer<typeof playlistProposalSchema>;
export type OrganizeProposal = z.infer<typeof organizeProposalSchema>;

export interface OrganizeInput {
  title: string;
  description: string | null;
  fullText: string;
  segments: { start: number; end: number; text: string }[];
  knownTriggers: { name: string; slug: string }[];
}
