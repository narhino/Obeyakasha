import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

/**
 * Job queue producer side (ROADMAP-v1.5 C1.1). Anything that used to be a
 * fire-and-forget promise in the web process now calls `enqueue`; the worker
 * runs it. See `runner.ts` for the consumer side.
 */

/** Retry backoff by attempt number (1-indexed). Last value repeats. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

/** Delay before the next retry given how many attempts have already run. */
export function nextBackoffMs(attempts: number): number {
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[idx]!;
}

export interface EnqueueOpts {
  /** At most one active job may hold this key (partial unique index). */
  dedupeKey?: string;
  /** Delay before the job becomes claimable. */
  delayMs?: number;
  /** Total attempts before the job is marked failed (default 3). */
  maxAttempts?: number;
}

/**
 * Enqueue a job. If `dedupeKey` is set and an active (queued|running) job
 * already holds it, this is a no-op (idempotent) — safe to call from the
 * auto-pipeline without double-scheduling.
 */
export async function enqueue(
  kind: string,
  payload: Record<string, unknown> = {},
  opts: EnqueueOpts = {},
): Promise<void> {
  const runAt =
    opts.delayMs && opts.delayMs > 0
      ? new Date(Date.now() + opts.delayMs)
      : new Date();
  await db
    .insert(jobs)
    .values({
      kind,
      payload,
      dedupeKey: opts.dedupeKey ?? null,
      maxAttempts: opts.maxAttempts ?? 3,
      runAt,
    })
    .onConflictDoNothing();
}
