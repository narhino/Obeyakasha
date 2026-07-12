"use server";

import { revalidatePath } from "next/cache";
import { requireGoddess } from "@/lib/auth-helpers";
import { enqueue } from "@/lib/jobs/queue";
import { logAudit } from "@/lib/audit";

/** Queue one Patreon post for import (ROADMAP Phase I). */
export async function importPostAction(formData: FormData) {
  const session = await requireGoddess();
  const postId = String(formData.get("postId"));
  if (!postId) return;
  await enqueue(
    "patreon-import",
    { postId },
    { dedupeKey: `patreon:${postId}` },
  );
  await logAudit(session.user.id, "patreon.import_queued", { postId });
  revalidatePath("/sanctum/import");
}

/** Queue every not-yet-imported post shown on the page. */
export async function importAllNewAction(formData: FormData) {
  const session = await requireGoddess();
  const ids = String(formData.get("postIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const postId of ids) {
    await enqueue(
      "patreon-import",
      { postId },
      { dedupeKey: `patreon:${postId}` },
    );
  }
  await logAudit(session.user.id, "patreon.import_all_queued", {
    count: ids.length,
  });
  revalidatePath("/sanctum/import");
}
