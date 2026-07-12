"use server";

import { revalidatePath } from "next/cache";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { organizeAll, organizeTrack } from "@/lib/organize/run";
import { applyReview, rejectReview } from "@/lib/organize/apply";

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
  await applyReview(reviewId, session.user.id);
  revalidatePath("/sanctum/organize");
  revalidatePath("/sanctum/library");
}

export async function rejectReviewAction(formData: FormData) {
  const session = await requireGoddess();
  const reviewId = String(formData.get("reviewId"));
  await rejectReview(reviewId, session.user.id);
  revalidatePath("/sanctum/organize");
}
