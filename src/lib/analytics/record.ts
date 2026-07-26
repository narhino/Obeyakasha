import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageViews } from "@/lib/db/schema";
import { clampDwell, type DeviceBucket } from "./core";

/**
 * The only two writes this whole feature makes. Both are called from
 * `POST /api/track` after the values have been normalized and bounded.
 */

/** Insert one view; returns the row id the client sends back with its dwell. */
export async function recordView(row: {
  visitorId: string;
  userId: string | null;
  path: string;
  referrerHost: string | null;
  device: DeviceBucket;
  isSignedIn: boolean;
}): Promise<string | null> {
  const [inserted] = await db
    .insert(pageViews)
    .values(row)
    .returning({ id: pageViews.id });
  return inserted?.id ?? null;
}

/**
 * Fold a dwell report into an existing view.
 *
 * MONOTONIC by design (`GREATEST`): the client sends its running total of
 * *visible* milliseconds every time the page hides, unloads, or the route
 * changes, so a later beacon may only ever refine the number upward — and the
 * value is clamped before it reaches SQL, so it can never grow without bound.
 * A `viewId` that does not exist updates nothing.
 */
export async function recordDwell(viewId: string, dwellMs: number): Promise<void> {
  const ms = clampDwell(dwellMs);
  if (ms <= 0) return;
  await db
    .update(pageViews)
    .set({ dwellMs: sql`greatest(coalesce(${pageViews.dwellMs}, 0), ${ms})` })
    .where(eq(pageViews.id, viewId));
}
