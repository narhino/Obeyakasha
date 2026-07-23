import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { nextBackoffMs } from "./queue";

/**
 * Job queue consumer side (ROADMAP-v1.5 C1.1). A single worker process calls
 * `jobsTick()` on an interval. Each tick claims due jobs per kind (respecting
 * per-kind concurrency) with `FOR UPDATE SKIP LOCKED`, runs the registered
 * handler, and marks the row done / retried-with-backoff / failed.
 */

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

interface Registration {
  handler: JobHandler;
  concurrency: number;
}

const REGISTRY = new Map<string, Registration>();
/** In-process count of currently-running jobs per kind (single-worker model). */
const active = new Map<string, number>();

/**
 * A job left in `running` whose worker died mid-run (a restart, a deploy, a
 * crash) is never re-claimed — the claim query only takes `queued` rows — so it
 * shows "transcribing…" forever. Once its lock is older than 15 minutes (longer
 * than any handler's own 12-min request timeout, so a live worker is never
 * yanked out from under itself), requeue it so the work resumes.
 *
 * Written as one raw statement — the SAME shape as `claim()` below — and the
 * cutoff computed by the database (`now() - interval`), never a JS Date param,
 * so there is no client/driver timestamp-casting quirk to silently no-op on.
 * Logs how many it rescued; errors are surfaced by the caller, never swallowed.
 */
async function reclaimStale(): Promise<number> {
  const result = await db.execute(sql`
    update ${jobs} set
      status = 'queued',
      run_at = now(),
      locked_at = null,
      last_error = 'requeued after a stale lock (worker restart or hang)',
      updated_at = now()
    where ${jobs.status} = 'running'
      and ${jobs.lockedAt} is not null
      and ${jobs.lockedAt} < now() - interval '15 minutes'
    returning ${jobs.id} as id
  `);
  const rows = (result as unknown as unknown[]) ?? [];
  const n = rows.length;
  if (n > 0) console.log(`[worker] reclaimed ${n} stale job(s) → queued`);
  return n;
}

export function registerHandler(
  kind: string,
  handler: JobHandler,
  concurrency = 1,
): void {
  REGISTRY.set(kind, { handler, concurrency });
}

/** Test/reset helper. */
export function _clearHandlers(): void {
  REGISTRY.clear();
  active.clear();
}

interface ClaimedJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

/**
 * Atomically claim up to `limit` due jobs of one kind. `SKIP LOCKED` lets
 * concurrent claims never block each other; the `attempts` bump happens in the
 * same statement so a crash mid-run still counts as an attempt.
 */
async function claim(kind: string, limit: number): Promise<ClaimedJob[]> {
  if (limit <= 0) return [];
  const result = await db.execute(sql`
    update ${jobs} set
      status = 'running',
      locked_at = now(),
      attempts = ${jobs.attempts} + 1,
      updated_at = now()
    where ${jobs.id} in (
      select ${jobs.id} from ${jobs}
      where ${jobs.status} = 'queued'
        and ${jobs.kind} = ${kind}
        and ${jobs.runAt} <= now()
      order by ${jobs.runAt}
      for update skip locked
      limit ${limit}
    )
    returning ${jobs.id} as id, ${jobs.kind} as kind, ${jobs.payload} as payload,
      ${jobs.attempts} as attempts, ${jobs.maxAttempts} as max_attempts
  `);
  const rows = (result as unknown as Record<string, unknown>[]) ?? [];
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    payload: (r.payload as Record<string, unknown> | null) ?? {},
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
  }));
}

async function markDone(id: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", lastError: null, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

async function markFailedOrRetry(
  job: ClaimedJob,
  message: string,
): Promise<void> {
  const trimmed = message.slice(0, 1000);
  // `attempts` was already incremented at claim time.
  if (job.attempts < job.maxAttempts) {
    await db
      .update(jobs)
      .set({
        status: "queued",
        runAt: new Date(Date.now() + nextBackoffMs(job.attempts)),
        lastError: trimmed,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));
    return;
  }
  await db
    .update(jobs)
    .set({ status: "failed", lastError: trimmed, updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
  await logAudit(null, "job.failed", {
    jobId: job.id,
    kind: job.kind,
    attempts: job.attempts,
    message: trimmed,
  });
}

async function runJob(job: ClaimedJob): Promise<void> {
  const reg = REGISTRY.get(job.kind);
  if (!reg) {
    await markFailedOrRetry(job, `no handler registered for kind "${job.kind}"`);
    return;
  }
  try {
    await reg.handler(job.payload);
    await markDone(job.id);
  } catch (err) {
    await markFailedOrRetry(
      job,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * One scheduling pass. Claims and dispatches due jobs across all registered
 * kinds up to each kind's concurrency, then returns immediately — the handlers
 * run in the background and free their slot on completion.
 */
export async function jobsTick(): Promise<void> {
  // First, rescue anything a dead worker left stranded in `running`. Surface
  // failures (a swallowed error here once hid a broken reclaim) — a failed
  // reclaim must not also fail the whole tick, so it's logged, not thrown.
  await reclaimStale().catch((e) =>
    console.error("[worker] reclaim failed:", e),
  );
  for (const [kind, reg] of REGISTRY) {
    const slots = reg.concurrency - (active.get(kind) ?? 0);
    if (slots <= 0) continue;
    const claimed = await claim(kind, slots);
    for (const job of claimed) {
      active.set(kind, (active.get(kind) ?? 0) + 1);
      void runJob(job).finally(() => {
        active.set(kind, Math.max(0, (active.get(kind) ?? 1) - 1));
      });
    }
  }
}
