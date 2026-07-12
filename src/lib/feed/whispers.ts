import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { whisperReceipts, whispers } from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { audienceMatches } from "@/lib/push/audience";

export interface WhisperCard {
  id: string;
  body: string | null;
  imageKey: string | null;
  publishedAt: Date | null;
  knelt: boolean;
}

/** Whispers targeted to this subject, newest first (A11). */
export async function whispersForSubject(
  userId: string,
  userLevel: number,
  limit = 50,
): Promise<WhisperCard[]> {
  const rows = await db
    .select()
    .from(whispers)
    .where(isNotNull(whispers.publishedAt))
    .orderBy(desc(whispers.publishedAt))
    .limit(200);

  const matched = rows.filter((w) =>
    audienceMatches(w.audience as Audience, userLevel, userId),
  );
  if (matched.length === 0) return [];

  const receipts = await db
    .select()
    .from(whisperReceipts)
    .where(eq(whisperReceipts.userId, userId));
  const kneltSet = new Set(
    receipts.filter((r) => r.kneltAt).map((r) => r.whisperId),
  );

  return matched.slice(0, limit).map((w) => ({
    id: w.id,
    body: w.body,
    imageKey: w.imageKey,
    publishedAt: w.publishedAt,
    knelt: kneltSet.has(w.id),
  }));
}

/** Mark a whisper seen + knelt for a subject (idempotent). */
export async function kneel(userId: string, whisperId: string): Promise<void> {
  await db
    .insert(whisperReceipts)
    .values({ whisperId, userId, seenAt: new Date(), kneltAt: new Date() })
    .onConflictDoUpdate({
      target: [whisperReceipts.whisperId, whisperReceipts.userId],
      set: { kneltAt: new Date(), seenAt: new Date() },
    });
}

/** Per-whisper seen/knelt counts for the Sanctum. */
export async function whisperStats(whisperId: string) {
  const receipts = await db
    .select()
    .from(whisperReceipts)
    .where(eq(whisperReceipts.whisperId, whisperId));
  return {
    seen: receipts.filter((r) => r.seenAt).length,
    knelt: receipts.filter((r) => r.kneltAt).length,
  };
}
