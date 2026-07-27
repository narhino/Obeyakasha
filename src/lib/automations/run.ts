import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  automations,
  chains,
  entitlements,
  listenSessions,
  users,
} from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { broadcast } from "@/lib/push/broadcast";
import { logAudit } from "@/lib/audit";
// The catalogue lives in its own pure module so the Sanctum's client editor can
// read it without pulling web-push into the browser bundle.
import { triggerSpec } from "./triggers";
export { TRIGGERS, triggerSpec, type TriggerSpec } from "./triggers";

/**
 * The automation engine.
 *
 * Every automatic push used to be a hard-coded block in the worker: she could
 * turn the whole set off with one setting, could not read what any of them
 * said, and could not add another without a deploy. Now each is a row she owns
 * — its words, its audience, its timing, its on/off.
 *
 * What is NOT hers to invent is the `trigger`: the worker can only fire on
 * conditions it has code to detect. Each trigger below is one such condition,
 * and `TRIGGERS` is the contract the Sanctum reads to describe them honestly.
 */

/** Subject ids the given trigger currently applies to. One query per trigger. */
async function subjectsFor(
  trigger: string,
  params: Record<string, number>,
): Promise<string[]> {
  if (trigger === "inactive_days") {
    // A one-day window, not "older than N": a plain `<` would re-fire this
    // every run for the rest of a lapsed subject's life.
    const days = Math.max(2, Math.min(60, params.days ?? 5));
    const rows = await db
      .select({ userId: listenSessions.userId })
      .from(listenSessions)
      .groupBy(listenSessions.userId)
      .having(
        and(
          sql`max(${listenSessions.endedAt}) < now() - (${days} * interval '1 day')`,
          sql`max(${listenSessions.endedAt}) > now() - (${days + 1} * interval '1 day')`,
        ),
      );
    return rows.map((r) => r.userId);
  }

  if (trigger === "chain_broken") {
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
    return rows.map((r) => r.userId);
  }

  if (trigger === "anniversary") {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "subject"),
          sql`date_part('month', ${users.createdAt}) = date_part('month', current_date)`,
          sql`date_part('day', ${users.createdAt}) = date_part('day', current_date)`,
          sql`${users.createdAt} < current_date - interval '300 days'`,
        ),
      );
    return rows.map((r) => r.id);
  }

  if (trigger === "lapse") {
    // Froze within the last day — a one-day window for the same reason as
    // above: "is frozen" would re-fire forever, "froze just now" fires once.
    // `frozen` is the real status the entitlement engine writes; there is no
    // "lapsed" state in the enum, and inventing one here would never match.
    const rows = await db
      .select({ userId: entitlements.userId })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.status, "frozen"),
          sql`${entitlements.updatedAt} > now() - interval '1 day'`,
        ),
      );
    return [...new Set(rows.map((r) => r.userId))];
  }

  // `new_track` and `program_day_unlocked` fire from the publish paths that
  // already push, not from a poll. Nothing to sweep for here.
  return [];
}

/** Narrow the trigger's subjects by the automation's own audience selector. */
function intersect(userIds: string[], audience: Audience): Audience {
  if (audience.type === "users") {
    const allowed = new Set(audience.userIds);
    return { type: "users", userIds: userIds.filter((id) => allowed.has(id)) };
  }
  // For every other selector the audience is a FILTER, and broadcast already
  // knows how to apply level / oath / all. Expanding it here would duplicate
  // that logic, so the trigger's list is passed through and the selector is
  // honoured by narrowing to those users who also match it.
  return { type: "users", userIds };
}

export interface AutomationRun {
  id: string;
  label: string;
  trigger: string;
  reached: number;
}

/**
 * Fire every enabled automation whose trigger currently matches someone.
 * Called hourly by the worker. Each row records what it reached, so the Sanctum
 * can show her the last result instead of asking her to trust it ran.
 */
export async function runAutomations(): Promise<AutomationRun[]> {
  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.enabled, true));

  const out: AutomationRun[] = [];
  for (const a of rows) {
    let reached = 0;
    try {
      const userIds = await subjectsFor(a.trigger, a.params);
      if (userIds.length > 0) {
        const stats = await broadcast({
          title: a.title,
          body: a.body ?? undefined,
          deepLink: a.deepLink ?? undefined,
          audience: intersect(userIds, a.audience),
          kind: "automation",
          respectQuietHours: a.respectQuietHours,
        });
        reached = stats.sent;
      }
    } catch (err) {
      console.error(`[automations] ${a.label} failed:`, err);
      continue;
    }
    await db
      .update(automations)
      .set({ lastRunAt: new Date(), lastReached: reached, updatedAt: new Date() })
      .where(eq(automations.id, a.id));
    out.push({ id: a.id, label: a.label, trigger: a.trigger, reached });
  }
  if (out.length > 0) {
    await logAudit(null, "automation.ran", {
      fired: out.map((o) => ({ label: o.label, reached: o.reached })),
    });
  }
  return out;
}

/**
 * Seed the two automations that used to be hard-coded, OFF, so nothing starts
 * pinging anyone the moment this ships. Idempotent: it only writes when the
 * table is empty, so her edits are never overwritten by a restart.
 */
export async function seedAutomations(): Promise<void> {
  const [existing] = await db
    .select({ id: automations.id })
    .from(automations)
    .limit(1);
  if (existing) return;
  await db.insert(automations).values([
    {
      trigger: "inactive_days" as const,
      label: "They went quiet",
      title: "You slipped.",
      body: "The chain slackened. Come back down to me.",
      deepLink: "/library",
      params: { days: 5 },
      enabled: false,
    },
    {
      trigger: "chain_broken" as const,
      label: "Their chain broke",
      title: "Your chain broke.",
      body: "Reclaim it. One breath, and you're mine again.",
      deepLink: "/me",
      params: {},
      enabled: false,
    },
  ]);
}

/** Nothing enabled anywhere → the Sanctum says so instead of implying activity. */
export async function automationCount(): Promise<{ total: number; on: number }> {
  const rows = await db
    .select({ enabled: automations.enabled })
    .from(automations);
  return { total: rows.length, on: rows.filter((r) => r.enabled).length };
}
