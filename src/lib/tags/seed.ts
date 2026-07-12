import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { vocabularyEntries } from "./vocabulary";

/**
 * Idempotently ensure the starter field vocabulary exists (ROADMAP-v1.5). Runs
 * at worker boot; the unique (kind, value) index makes repeats a no-op, and new
 * vocabulary added later self-heals on the next deploy.
 */
export async function ensureVocabulary(): Promise<void> {
  const entries = vocabularyEntries();
  if (entries.length === 0) return;
  await db
    .insert(tags)
    .values(entries)
    .onConflictDoNothing({ target: [tags.kind, tags.value] });
}
