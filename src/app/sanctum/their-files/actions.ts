"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { deleteUpload } from "@/lib/library/uploads";

const schema = z.object({ trackId: z.string().uuid() });

/** The goddess removes a subject's personal file from Sanctum oversight (F1). */
export async function deleteTheirFile(formData: FormData) {
  const session = await requireGoddess();
  const parsed = schema.safeParse({ trackId: formData.get("trackId") });
  if (!parsed.success) throw new Error("Invalid file");

  // No requireOwner — she may remove any personal upload (deleteUpload still
  // refuses to touch a catalog track).
  const res = await deleteUpload(parsed.data.trackId);
  if (!res.ok) throw new Error(res.reason);

  await logAudit(session.user.id, "subject_upload.deleted_by_goddess", {
    trackId: parsed.data.trackId,
  });
  revalidatePath("/sanctum/their-files");
}
