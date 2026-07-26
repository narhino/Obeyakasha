import "dotenv/config";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chains,
  listenSessions,
  orderAssignments,
  orders,
  users,
  whispers,
} from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { getSetting } from "@/lib/settings";
import { closePoll, expiredOpenPolls } from "@/lib/polls/ops";
import { broadcast } from "@/lib/push/broadcast";
import { sendWhisperPush } from "@/lib/feed/publish";
import { announceDuePremieres } from "@/lib/premiere/announce";
import { grantMonthlyGift } from "@/lib/oath/gift";
import { pruneOldPageViews } from "@/lib/analytics/retention";
import { logAudit } from "@/lib/audit";
import { jobsTick } from "@/lib/jobs/runner";
import { registerCoreJobHandlers } from "@/lib/jobs/handlers";
import { ensureVocabulary } from "@/lib/tags/seed";
import { copy } from "@/copy/copy";

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

/**
 * Deadline warnings (R5/R7). Tasks still owed (sent|seen) whose order is due
 * within the next 24h and haven't been warned yet → one push per subject, then
 * stamp `deadlineWarnedAt` so we never re-warn. NOT gated behind
 * `automations_enabled`: this is her explicit deadline surfacing, not a presence
 * ping, so it always runs (quiet hours still respected by broadcast).
 */
async function deadlineWarnTick() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60_000);
  const rows = await db
    .select({
      userId: orderAssignments.userId,
      orderId: orderAssignments.orderId,
      title: orders.title,
      dueAt: orders.dueAt,
    })
    .from(orderAssignments)
    .innerJoin(orders, eq(orders.id, orderAssignments.orderId))
    .where(
      and(
        inArray(orderAssignments.status, ["sent", "seen"]),
        isNull(orderAssignments.deadlineWarnedAt),
        isNotNull(orders.dueAt),
        gt(orders.dueAt, now),
        lt(orders.dueAt, in24h),
      ),
    );
  if (rows.length === 0) return;

  // Batch per subject → one whisper even if several tasks loom; the push body is
  // the soonest one's title.
  const byUser = new Map<
    string,
    { orderIds: string[]; soonestTitle: string; soonestDue: Date }
  >();
  for (const r of rows) {
    if (!r.dueAt) continue;
    const entry = byUser.get(r.userId);
    if (!entry) {
      byUser.set(r.userId, {
        orderIds: [r.orderId],
        soonestTitle: r.title,
        soonestDue: r.dueAt,
      });
    } else {
      entry.orderIds.push(r.orderId);
      if (r.dueAt < entry.soonestDue) {
        entry.soonestDue = r.dueAt;
        entry.soonestTitle = r.title;
      }
    }
  }

  for (const [userId, entry] of byUser) {
    const stats = await broadcast({
      title: copy.tasks.deadlineWarnPush.title,
      body: entry.soonestTitle,
      deepLink: "/orders",
      audience: { type: "users", userIds: [userId] },
      kind: "automation",
      respectQuietHours: true,
    });
    // Held back purely by quiet hours → leave unmarked so the next hourly tick
    // retries once they're out of it. Any real attempt (sent / no-device /
    // failed) marks the tasks warned so we don't nag every hour.
    const quietOnly =
      stats.skippedQuiet > 0 &&
      stats.sent + stats.failed + stats.pruned + stats.skippedNoDevice === 0;
    if (quietOnly) continue;
    await db
      .update(orderAssignments)
      .set({ deadlineWarnedAt: new Date() })
      .where(
        and(
          eq(orderAssignments.userId, userId),
          inArray(orderAssignments.orderId, entry.orderIds),
        ),
      );
  }
  await logAudit(null, "automation.deadline_warned", { users: byUser.size });
}

/**
 * Scheduled whispers (R9.9a). Publish any whisper whose time has come — set
 * publishedAt (making it visible to the feed) and fire the audience push via the
 * SAME path immediate publishing uses, so the two can never drift. The update is
 * the claim: `WHERE published_at IS NULL` means two overlapping ticks (or a
 * restart) can never double-publish or double-push the same whisper.
 */
async function scheduledWhisperTick() {
  const now = new Date();
  const due = await db
    .select({
      id: whispers.id,
      body: whispers.body,
      pollId: whispers.pollId,
      audience: whispers.audience,
    })
    .from(whispers)
    .where(
      and(
        isNull(whispers.publishedAt),
        isNotNull(whispers.scheduledFor),
        lte(whispers.scheduledFor, now),
      ),
    );
  if (due.length === 0) return;

  for (const w of due) {
    const claimed = await db
      .update(whispers)
      .set({ publishedAt: now })
      .where(and(eq(whispers.id, w.id), isNull(whispers.publishedAt)))
      .returning({ id: whispers.id });
    if (claimed.length === 0) continue; // another tick got it first

    await sendWhisperPush({
      body: w.body,
      pollId: w.pollId,
      audience: w.audience as Audience,
      whisperId: w.id,
    });
    await logAudit(null, "whisper.scheduled_published", { whisperId: w.id });
  }
}

/**
 * Premieres (R9.6). Announce any published track whose premiereAt just passed —
 * runs alongside scheduledWhisperTick every 60s. The announce claims each track
 * (premiereAnnouncedAt) so it fires exactly once, quiet hours yielding.
 */
async function premiereTick() {
  await announceDuePremieres();
}

/**
 * The collared's monthly gift (R9.5). Daily tick; grantMonthlyGift is guarded to
 * run at most once per calendar month via the oath_gift_last_granted stamp, so
 * it lands on the 1st (or the first tick after) and never repeats.
 */
async function oathGiftTick() {
  await grantMonthlyGift();
}

/**
 * Analytics retention (A21). Daily: drop `page_views` rows past the
 * `analytics_retention_days` window. First-party traffic data is still data —
 * it ages out on its own rather than accumulating forever.
 */
async function analyticsRetentionTick() {
  const n = await pruneOldPageViews();
  if (n > 0) console.log(`[worker] analytics retention: pruned ${n} page views.`);
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
  void safe("vocabulary", ensureVocabulary); // seed field tags (idempotent)
  // Durable job queue: drain every 3s (transcribe/organize/…).
  setInterval(() => void safe("jobs", jobsTick), 3_000);
  // Poll close: every 5 minutes.
  setInterval(() => void safe("pollClose", pollCloseTick), 5 * 60_000);
  // Scheduled whispers: publish due ones every 60s (R9.9a).
  setInterval(() => void safe("scheduledWhisper", scheduledWhisperTick), 60_000);
  // Premieres: announce due ones every 60s (R9.6).
  setInterval(() => void safe("premiere", premiereTick), 60_000);
  // The collared's monthly gift: daily (guarded once-per-month) (R9.5).
  setInterval(() => void safe("oathGift", oathGiftTick), 24 * 60 * 60_000);
  // Analytics retention: daily (A21).
  setInterval(
    () => void safe("analyticsRetention", analyticsRetentionTick),
    24 * 60 * 60_000,
  );
  // Presence automations: hourly.
  setInterval(() => void safe("inactiveReclaim", inactiveReclaimTick), 60 * 60_000);
  setInterval(() => void safe("chainBroken", chainBrokenTick), 60 * 60_000);
  // Deadline warnings: hourly (order-driven, always on).
  setInterval(() => void safe("deadlineWarn", deadlineWarnTick), 60 * 60_000);
  // Run once shortly after boot.
  setTimeout(() => void safe("pollClose", pollCloseTick), 10_000);
  setTimeout(() => void safe("scheduledWhisper", scheduledWhisperTick), 15_000);
  setTimeout(() => void safe("premiere", premiereTick), 17_000);
  setTimeout(() => void safe("deadlineWarn", deadlineWarnTick), 20_000);
  setTimeout(() => void safe("oathGift", oathGiftTick), 25_000);
  setTimeout(
    () => void safe("analyticsRetention", analyticsRetentionTick),
    30_000,
  );
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
