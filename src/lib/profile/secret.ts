"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

const schema = z.object({ on: z.boolean() });

/**
 * Own-user server action: flip Secret mode (R6). Shared by the You page toggle
 * and the Gate's notification step so both write the same column the same way.
 * Audited with the subject as the actor (it's their own choice, not a Sanctum
 * mutation). Revalidating /me refreshes the toggle's server-rendered state.
 */
export async function setDisguiseMode(on: boolean): Promise<{ on: boolean }> {
  const session = await requireSubject();
  const { on: value } = schema.parse({ on });
  await db
    .update(users)
    .set({ disguiseMode: value, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));
  await logAudit(session.user.id, "me.disguise", { on: value });
  revalidatePath("/me");
  return { on: value };
}
