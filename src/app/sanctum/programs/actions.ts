"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { programItems, programs } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

function slugify(s: string): string {
  return (
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "program"
  );
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  gating: z.enum(["open", "sequential", "daily"]),
  minAccessLevel: z.coerce.number().int().min(0).max(99),
  description: z.string().max(2000).optional(),
});

export async function createProgram(formData: FormData) {
  const session = await requireGoddess();
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    gating: formData.get("gating"),
    minAccessLevel: formData.get("minAccessLevel"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) throw new Error("Invalid program");

  await db.insert(programs).values({
    title: parsed.data.title,
    slug: slugify(parsed.data.title),
    gating: parsed.data.gating,
    minAccessLevel: parsed.data.minAccessLevel,
    description: parsed.data.description,
  });
  await logAudit(session.user.id, "program.created", { title: parsed.data.title });
  revalidatePath("/sanctum/programs");
}

export async function addProgramItem(formData: FormData) {
  const session = await requireGoddess();
  const programId = String(formData.get("programId"));
  const trackId = String(formData.get("trackId"));
  const dayRaw = formData.get("dayNumber");
  const dayNumber = dayRaw ? Number(dayRaw) : null;

  const [{ value: currentMax } = { value: null }] = await db
    .select({ value: max(programItems.sort) })
    .from(programItems)
    .where(eq(programItems.programId, programId));

  await db.insert(programItems).values({
    programId,
    trackId,
    dayNumber: dayNumber != null && Number.isFinite(dayNumber) ? dayNumber : null,
    sort: (currentMax ?? -1) + 1,
  });
  await logAudit(session.user.id, "program.item_added", { programId, trackId });
  revalidatePath("/sanctum/programs");
}

export async function removeProgramItem(formData: FormData) {
  const session = await requireGoddess();
  const programId = String(formData.get("programId"));
  const trackId = String(formData.get("trackId"));
  await db
    .delete(programItems)
    .where(
      and(
        eq(programItems.programId, programId),
        eq(programItems.trackId, trackId),
      ),
    );
  await logAudit(session.user.id, "program.item_removed", { programId, trackId });
  revalidatePath("/sanctum/programs");
}

export async function setProgramVisibility(formData: FormData) {
  const session = await requireGoddess();
  const programId = String(formData.get("programId"));
  const visibility = String(formData.get("visibility"));
  if (!["draft", "published", "archived"].includes(visibility)) {
    throw new Error("Invalid visibility");
  }
  await db
    .update(programs)
    .set({ visibility: visibility as "draft" | "published" | "archived", updatedAt: new Date() })
    .where(eq(programs.id, programId));
  await logAudit(session.user.id, "program.visibility", { programId, visibility });
  revalidatePath("/sanctum/programs");
}
