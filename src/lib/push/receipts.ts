import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  devices,
  notificationDeliveries,
  notifications,
} from "@/lib/db/schema";

/**
 * What actually became of a notification on the way to a subject. The three
 * states are genuinely different and the Sanctum shows all three, because
 * "sent" alone has always been the misleading one:
 *
 *   accepted  — the push service took it. Says nothing about the phone.
 *   delivered — the service worker drew it on at least one of their devices.
 *   opened    — they tapped it.
 *
 * A push that is accepted but never delivered is the signature of a phone that
 * is off, a muted OS-level notification, or a stale subscription.
 */
export type ReachState = "none" | "accepted" | "delivered" | "opened";

export interface PushReach {
  state: ReachState;
  /** How many device rows this push was attempted on. */
  devices: number;
  deliveredAt: Date | null;
  openedAt: Date | null;
}

const EMPTY: PushReach = {
  state: "none",
  devices: 0,
  deliveredAt: null,
  openedAt: null,
};

/** Batch the reach of many notifications at once (no N+1 in a thread render). */
export async function reachFor(
  notificationIds: string[],
): Promise<Map<string, PushReach>> {
  const map = new Map<string, PushReach>();
  const ids = [...new Set(notificationIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(inArray(notificationDeliveries.notificationId, ids));

  for (const r of rows) {
    const cur = map.get(r.notificationId) ?? { ...EMPTY };
    cur.devices += 1;
    // Earliest delivery / open across their devices — the moment it landed.
    if (r.deliveredAt && (!cur.deliveredAt || r.deliveredAt < cur.deliveredAt))
      cur.deliveredAt = r.deliveredAt;
    if (r.openedAt && (!cur.openedAt || r.openedAt < cur.openedAt))
      cur.openedAt = r.openedAt;
    cur.state = cur.openedAt ? "opened" : cur.deliveredAt ? "delivered" : "accepted";
    map.set(r.notificationId, cur);
  }
  return map;
}

export interface SubjectReach {
  /** Devices registered at all — the app is installed somewhere. */
  devices: number;
  /** Devices that can actually be pushed to right now. */
  pushEnabled: number;
  /** Last time any of their devices was seen. */
  lastSeenAt: Date | null;
  /** Pushes attempted in the window, and what became of them. */
  sent: number;
  delivered: number;
  opened: number;
  lastDeliveredAt: Date | null;
  lastOpenedAt: Date | null;
}

/** Everything the Sanctum knows about whether she can actually reach someone. */
export async function subjectReach(userId: string): Promise<SubjectReach> {
  const [deviceRows, agg] = await Promise.all([
    db.select().from(devices).where(eq(devices.userId, userId)),
    db
      .select({
        sent: sql<number>`count(*)::int`,
        delivered: sql<number>`count(${notificationDeliveries.deliveredAt})::int`,
        opened: sql<number>`count(${notificationDeliveries.openedAt})::int`,
        lastDeliveredAt: sql<Date | null>`max(${notificationDeliveries.deliveredAt})`,
        lastOpenedAt: sql<Date | null>`max(${notificationDeliveries.openedAt})`,
      })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.userId, userId)),
  ]);

  const a = agg[0];
  const lastSeen = deviceRows
    .map((d) => d.lastActiveAt)
    .filter((d): d is Date => Boolean(d))
    .sort((x, y) => y.getTime() - x.getTime())[0];

  return {
    devices: deviceRows.length,
    pushEnabled: deviceRows.filter((d) => d.pushEnabled && d.pushSubscription)
      .length,
    lastSeenAt: lastSeen ?? null,
    sent: a?.sent ?? 0,
    delivered: a?.delivered ?? 0,
    opened: a?.opened ?? 0,
    lastDeliveredAt: a?.lastDeliveredAt ?? null,
    lastOpenedAt: a?.lastOpenedAt ?? null,
  };
}

export interface SubjectNotificationRow {
  id: string;
  title: string;
  body: string | null;
  deepLink: string | null;
  sentAt: Date | null;
  state: ReachState;
  deliveredAt: Date | null;
  openedAt: Date | null;
}

/** The last N pushes she aimed at ONE subject, each with what became of it. */
export async function subjectNotifications(
  userId: string,
  limit = 20,
): Promise<SubjectNotificationRow[]> {
  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      deepLink: notifications.deepLink,
      sentAt: notifications.sentAt,
      deliveredAt: notificationDeliveries.deliveredAt,
      openedAt: notificationDeliveries.openedAt,
    })
    .from(notificationDeliveries)
    .innerJoin(
      notifications,
      eq(notifications.id, notificationDeliveries.notificationId),
    )
    .where(eq(notificationDeliveries.userId, userId))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(limit * 3); // several device rows may share one notification

  const byNotification = new Map<string, SubjectNotificationRow>();
  for (const r of rows) {
    const cur = byNotification.get(r.id);
    if (!cur) {
      byNotification.set(r.id, {
        id: r.id,
        title: r.title,
        body: r.body,
        deepLink: r.deepLink,
        sentAt: r.sentAt,
        state: r.openedAt ? "opened" : r.deliveredAt ? "delivered" : "accepted",
        deliveredAt: r.deliveredAt,
        openedAt: r.openedAt,
      });
      continue;
    }
    // Collapse the subject's devices into one row — the best outcome wins.
    if (r.deliveredAt && (!cur.deliveredAt || r.deliveredAt < cur.deliveredAt))
      cur.deliveredAt = r.deliveredAt;
    if (r.openedAt && (!cur.openedAt || r.openedAt < cur.openedAt))
      cur.openedAt = r.openedAt;
    cur.state = cur.openedAt ? "opened" : cur.deliveredAt ? "delivered" : "accepted";
  }
  return [...byNotification.values()].slice(0, limit);
}

/** Platform-wide push health for the analytics page. `null` days = all time. */
export async function pushHealth(sinceDays: number | null = 30) {
  const since =
    sinceDays === null
      ? new Date(0)
      : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      attempted: sql<number>`count(*)::int`,
      delivered: sql<number>`count(${notificationDeliveries.deliveredAt})::int`,
      opened: sql<number>`count(${notificationDeliveries.openedAt})::int`,
      failed: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'failed')::int`,
      people: sql<number>`count(distinct ${notificationDeliveries.userId})::int`,
    })
    .from(notificationDeliveries)
    .where(and(sql`${notificationDeliveries.createdAt} >= ${since}`));
  return (
    row ?? { attempted: 0, delivered: 0, opened: 0, failed: 0, people: 0 }
  );
}
