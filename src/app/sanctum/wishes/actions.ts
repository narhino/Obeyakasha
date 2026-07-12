"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wishes } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

export async function setWishStatus(formData: FormData) {
  const session = await requireGoddess();
  const id = String(formData.get("wishId"));
  const status = String(formData.get("status")) as
    | "new"
    | "clustered"
    | "planned"
    | "shipped"
    | "declined";
  await db.update(wishes).set({ status }).where(eq(wishes.id, id));
  await logAudit(session.user.id, "wish.status", { id, status });
  revalidatePath("/sanctum/wishes");
}
