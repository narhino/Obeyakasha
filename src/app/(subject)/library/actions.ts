"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { deleteUpload } from "@/lib/library/uploads";

const schema = z.object({ trackId: z.string().uuid() });

/**
 * A subject takes one of their own uploads back (F1). Ownership is verified in
 * `deleteUpload` (requireOwner) — it refuses a track that isn't this subject's
 * personal upload — and it removes the stored objects before the row.
 */
export async function deleteMyUpload(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("unauthorized");
  const parsed = schema.safeParse({ trackId: formData.get("trackId") });
  if (!parsed.success) throw new Error("bad_request");

  const res = await deleteUpload(parsed.data.trackId, {
    requireOwner: session.user.id,
  });
  if (!res.ok) throw new Error(res.reason);

  await logAudit(session.user.id, "subject_upload.deleted", {
    trackId: parsed.data.trackId,
  });
  revalidatePath("/library");
}
