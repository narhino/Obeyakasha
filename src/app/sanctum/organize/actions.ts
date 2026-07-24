"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { organizeAll, organizeTrack } from "@/lib/organize/run";
import { applyReview, rejectReview } from "@/lib/organize/apply";

// Her edits to proposed triggers, folded in when she approves a review row.
const editedTriggerSchema = z.object({
  originalName: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  safetyNotes: z.string().max(4000).optional(),
});

export async function organizeAllAction() {
  const session = await requireGoddess();
  const n = await organizeAll();
  await logAudit(session.user.id, "organize.run_all", { tracks: n });
  revalidatePath("/sanctum/organize");
}

export async function organizeTrackAction(formData: FormData) {
  const session = await requireGoddess();
  const trackId = String(formData.get("trackId"));
  await organizeTrack(trackId);
  await logAudit(session.user.id, "organize.run_one", { trackId });
  revalidatePath("/sanctum/organize");
  revalidatePath("/sanctum/library");
}

export async function approveReviewAction(formData: FormData) {
  const session = await requireGoddess();
  const reviewId = String(formData.get("reviewId"));
  // Optional per-trigger edits (name completed, description/safety filled) she
  // made before approving; absent (e.g. a no-JS submit) keeps the raw proposal.
  const raw = formData.get("editedTriggers");
  const edits =
    typeof raw === "string" && raw.trim()
      ? z.array(editedTriggerSchema).parse(JSON.parse(raw))
      : undefined;
  await applyReview(reviewId, session.user.id, edits);
  revalidatePath("/sanctum/organize");
  revalidatePath("/sanctum/library");
}

export async function rejectReviewAction(formData: FormData) {
  const session = await requireGoddess();
  const reviewId = String(formData.get("reviewId"));
  await rejectReview(reviewId, session.user.id);
  revalidatePath("/sanctum/organize");
}
