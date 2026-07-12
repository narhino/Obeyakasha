import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  notificationDeliveries,
  users,
} from "@/lib/db/schema";
import type { Audience } from "@/lib/db/schema/relationship";
import { fill } from "@/copy/copy";
import { expandAudience } from "./audience";
import { isWithinQuietHours } from "./quiet";
import { sendToDevice, targetsForUsers, type PushPayload } from "./send";

export interface BroadcastInput {
  title: string;
  body?: string;
  deepLink?: string;
  audience: Audience;
  kind?: "manual" | "automation" | "system";
  createdBy?: string;
  /** Skip subjects currently inside their quiet hours (default true). */
  respectQuietHours?: boolean;
}

export interface BroadcastStats {
  notificationId: string;
  recipients: number;
  sent: number;
  failed: number;
  pruned: number;
  skippedQuiet: number;
  skippedNoDevice: number;
}

/**
 * Create a notification, expand its audience, and deliver it per device
 * (PLAN §12). Personalizes {name}/{honorific} per subject. Records a delivery
 * row per (notification, user, device). Non-override notifications are held
 * back for subjects inside their quiet hours.
 */
export async function broadcast(input: BroadcastInput): Promise<BroadcastStats> {
  const respectQuiet = input.respectQuietHours ?? true;
  const now = new Date();

  const [notif] = await db
    .insert(notifications)
    .values({
      kind: input.kind ?? "manual",
      title: input.title,
      body: input.body,
      deepLink: input.deepLink,
      audience: input.audience,
      createdBy: input.createdBy,
      sentAt: now,
    })
    .returning();
  const notificationId = notif!.id;

  const userIds = await expandAudience(input.audience);
  const stats: BroadcastStats = {
    notificationId,
    recipients: userIds.length,
    sent: 0,
    failed: 0,
    pruned: 0,
    skippedQuiet: 0,
    skippedNoDevice: 0,
  };
  if (userIds.length === 0) return stats;

  // Load per-user personalization + timezone/quiet-hours.
  const subjectRows = await db
    .select({
      id: users.id,
      chosenName: users.chosenName,
      honorific: users.honorific,
      timezone: users.timezone,
      qs: users.quietHoursStart,
      qe: users.quietHoursEnd,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));

  const targets = await targetsForUsers(userIds);

  for (const userId of userIds) {
    const subject = subjectById.get(userId);
    const isSystem = input.kind === "system";
    if (
      respectQuiet &&
      !isSystem &&
      subject &&
      isWithinQuietHours(now, subject.timezone, subject.qs, subject.qe)
    ) {
      stats.skippedQuiet++;
      continue;
    }

    const deviceTargets = targets.get(userId) ?? [];
    if (deviceTargets.length === 0) {
      stats.skippedNoDevice++;
      continue;
    }

    const payload: PushPayload = {
      title: fill(input.title, {
        name: subject?.chosenName ?? "my subject",
        honorific: subject?.honorific ?? "Goddess",
      }),
      body: input.body
        ? fill(input.body, {
            name: subject?.chosenName ?? "my subject",
            honorific: subject?.honorific ?? "Goddess",
          })
        : undefined,
      deepLink: input.deepLink,
      id: notificationId,
    };

    for (const target of deviceTargets) {
      const result = await sendToDevice(target, payload);
      await db.insert(notificationDeliveries).values({
        notificationId,
        userId,
        deviceId: target.deviceId,
        status:
          result === "sent"
            ? "sent"
            : result === "pruned" || result === "failed"
              ? "failed"
              : "queued",
      });
      if (result === "sent") stats.sent++;
      else if (result === "pruned") stats.pruned++;
      else if (result === "failed") stats.failed++;
    }
  }

  return stats;
}
