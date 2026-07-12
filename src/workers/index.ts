import "dotenv/config";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chains, listenSessions, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";
import { closePoll, expiredOpenPolls } from "@/lib/polls/ops";
import { broadcast } from "@/lib/push/broadcast";
import { logAudit } from "@/lib/audit";
import { jobsTick } from "@/lib/jobs/runner";
import { registerCoreJobHandlers } from "@/lib/jobs/handlers";

/**
 * Worker process (PLAN §18). Interval-based rather than pg-boss for v1 — simple
 * and sufficient at this scale (see docs/DECISIONS.log.md). Runs safe,
 * deterministic ticks (poll close) always; presence automations only when the
 * `automations_enabled` setting is on, so nothing pings subjects by default.
 * Also drains the durable job queue (ROADMAP-v1.5 C1.1) every 3s.
 */

async function pollCloseTick() {
  const expired = await expiredOpenPolls();
  for (const p of expired) {
    await closePoll(p.id);
    await logAudit(null, "poll.auto_closed", { pollId: p.id });
  }
}

async function inactiveReclaimTick() {
  if (!(await getSetting("automations_enabled"))) return;
  // Subjects whose most recent listen ended 5–6 days ago (narrow window so the
  // reclaim fires roughly once, not every run). Quiet hours respected by broadcast.
  const rows = await db
    .select({
      userId: listenSessions.userId,
      last: sql<Date>`max(${listenSessions.endedAt})`,
    })
    .from(listenSessions)
    .groupBy(listenSessions.userId)
    .having(
      and(
        sql`max(${listenSessions.endedAt}) < now() - interval '5 days'`,
        sql`max(${listenSessions.endedAt}) > now() - interval '6 days'`,
      ),
    );
  if (rows.length === 0) return;
  await broadcast({
    title: "You slipped.",
    body: "The chain slackened. Come back down to me.",
    deepLink: "/library",
    audience: { type: "users", userIds: rows.map((r) => r.userId) },
    kind: "automation",
  });
  await logAudit(null, "automation.inactive_reclaim", { count: rows.length });
}

async function chainBrokenTick() {
  if (!(await getSetting("automations_enabled"))) return;
  // Chains last kept exactly 2 days ago (broken yesterday) → one gentle nudge.
  const rows = await db
    .select({ userId: chains.userId })
    .from(chains)
    .where(
      and(
        lt(chains.lastKeptDate, sql`current_date - 1`),
        sql`${chains.lastKeptDate} >= current_date - 2`,
        sql`${chains.currentLen} >= 3`,
      ),
    );
  if (rows.length === 0) return;
  await broadcast({
    title: "Your chain broke.",
    body: "Reclaim it. One breath, and you're mine again.",
    deepLink: "/me",
    audience: { type: "users", userIds: rows.map((r) => r.userId) },
    kind: "automation",
  });
  await logAudit(null, "automation.chain_broken", { count: rows.length });
}

async function safe(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[worker] ${name} failed:`, err);
  }
}

async function main() {
  console.log("[worker] started (interval scheduler + job queue).");
  registerCoreJobHandlers();
  // Durable job queue: drain every 3s (transcribe/organize/…).
  setInterval(() => void safe("jobs", jobsTick), 3_000);
  // Poll close: every 5 minutes.
  setInterval(() => void safe("pollClose", pollCloseTick), 5 * 60_000);
  // Presence automations: hourly.
  setInterval(() => void safe("inactiveReclaim", inactiveReclaimTick), 60 * 60_000);
  setInterval(() => void safe("chainBroken", chainBrokenTick), 60 * 60_000);
  // Run once shortly after boot.
  setTimeout(() => void safe("pollClose", pollCloseTick), 10_000);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
