"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { playlistItems, playlists } from "@/lib/db/schema";
import { requireGoddess } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

const CADENCES = ["ongoing", "weekly", "ended"] as const;
const VISIBILITIES = ["draft", "published", "archived"] as const;

const detailsSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  cadence: z.enum(CADENCES),
  visibility: z.enum(VISIBILITIES),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDetails(formData: FormData) {
  return detailsSchema.safeParse({
    title: formData.get("title"),
    description: (formData.get("description") as string)?.trim() || undefined,
    cadence: formData.get("cadence") ?? "ongoing",
    visibility: formData.get("visibility") ?? "draft",
  });
}

/** Create a new curated series. */
export async function createSeries(formData: FormData) {
  const session = await requireGoddess();
  const parsed = parseDetails(formData);
  if (!parsed.success) throw new Error("Invalid series");

  const [row] = await db
    .insert(playlists)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      cadence: parsed.data.cadence,
      visibility: parsed.data.visibility,
      kind: "curated",
    })
    .returning({ id: playlists.id });
  await logAudit(session.user.id, "series.created", {
    playlistId: row?.id,
    title: parsed.data.title,
  });
  revalidatePath("/sanctum/series");
}

/** Edit a series' title / description / cadence / visibility. */
export async function updateSeries(formData: FormData) {
  const session = await requireGoddess();
  const playlistId = String(formData.get("playlistId"));
  if (!UUID_RE.test(playlistId)) throw new Error("Invalid series");
  const parsed = parseDetails(formData);
  if (!parsed.success) throw new Error("Invalid series");

  await db
    .update(playlists)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      cadence: parsed.data.cadence,
      visibility: parsed.data.visibility,
    })
    .where(eq(playlists.id, playlistId));
  await logAudit(session.user.id, "series.updated", { playlistId });
  revalidatePath("/sanctum/series");
}

/** Add a track to the end of a series. */
export async function addSeriesItem(formData: FormData) {
  const session = await requireGoddess();
  const playlistId = String(formData.get("playlistId"));
  const trackId = String(formData.get("trackId"));
  if (!UUID_RE.test(playlistId) || !UUID_RE.test(trackId)) {
    throw new Error("Invalid series item");
  }

  const [{ value: currentMax } = { value: null }] = await db
    .select({ value: max(playlistItems.sort) })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));

  await db.insert(playlistItems).values({
    playlistId,
    trackId,
    sort: (currentMax ?? -1) + 1,
  });
  await logAudit(session.user.id, "series.item_added", { playlistId, trackId });
  revalidatePath("/sanctum/series");
}

/** Remove one item (by its row id) from a series. */
export async function removeSeriesItem(formData: FormData) {
  const session = await requireGoddess();
  const playlistId = String(formData.get("playlistId"));
  const itemId = String(formData.get("itemId"));
  if (!UUID_RE.test(itemId)) throw new Error("Invalid item");

  await db.delete(playlistItems).where(eq(playlistItems.id, itemId));
  await logAudit(session.user.id, "series.item_removed", { playlistId, itemId });
  revalidatePath("/sanctum/series");
}

/**
 * Reorder a series item up or down. Rewrites sequential sort values across the
 * whole playlist so ordering stays clean even if prior sorts collided.
 */
export async function moveSeriesItem(formData: FormData) {
  const session = await requireGoddess();
  const playlistId = String(formData.get("playlistId"));
  const itemId = String(formData.get("itemId"));
  const direction = String(formData.get("direction"));
  if (!UUID_RE.test(playlistId) || !UUID_RE.test(itemId)) {
    throw new Error("Invalid item");
  }
  if (direction !== "up" && direction !== "down") {
    throw new Error("Invalid direction");
  }

  const items = await db
    .select({ id: playlistItems.id })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.sort), asc(playlistItems.id));

  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= items.length) return;

  const order = items.map((i) => i.id);
  const a = order[idx]!;
  order[idx] = order[swapWith]!;
  order[swapWith] = a;

  await Promise.all(
    order.map((id, i) =>
      db
        .update(playlistItems)
        .set({ sort: i })
        .where(
          and(eq(playlistItems.id, id), eq(playlistItems.playlistId, playlistId)),
        ),
    ),
  );
  await logAudit(session.user.id, "series.reordered", { playlistId, itemId, direction });
  revalidatePath("/sanctum/series");
}
