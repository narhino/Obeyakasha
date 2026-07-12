import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { jobStatus } from "./enums";

/**
 * Durable background-job queue (ROADMAP-v1.5 C1.1). The web process only ever
 * *enqueues*; the worker claims rows with `FOR UPDATE SKIP LOCKED` and runs the
 * registered handler for each `kind`. Survives restarts — nothing is lost to a
 * fire-and-forget promise anymore.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    // Optional idempotency key: at most one active (queued|running) job may hold
    // a given dedupeKey, enforced by the partial unique index below.
    dedupeKey: text("dedupe_key"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The worker's claim query: filter by status + kind, order by run_at.
    index("jobs_status_kind_run_at_idx").on(t.status, t.kind, t.runAt),
    // One active job per dedupeKey. `ON CONFLICT DO NOTHING` on enqueue relies
    // on this; done/failed rows don't participate, so a key can be re-used.
    uniqueIndex("jobs_dedupe_active_uq")
      .on(t.dedupeKey)
      .where(sql`status in ('queued', 'running') and dedupe_key is not null`),
  ],
);
