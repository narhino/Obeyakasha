import { desc, eq } from "drizzle-orm";
import { withSubject } from "@/lib/api";
import { db } from "@/lib/db";
import { notifications, notificationDeliveries } from "@/lib/db/schema";

/** Notifications this subject received — the in-app mirror of push (PLAN §12). */
export async function GET() {
  return withSubject(async (userId) => {
    const rows = await db
      .selectDistinctOn([notifications.id], {
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        deepLink: notifications.deepLink,
        sentAt: notifications.sentAt,
      })
      .from(notificationDeliveries)
      .innerJoin(
        notifications,
        eq(notifications.id, notificationDeliveries.notificationId),
      )
      .where(eq(notificationDeliveries.userId, userId))
      .orderBy(desc(notifications.id), desc(notifications.sentAt))
      .limit(50);

    // Sort by sentAt desc for display (selectDistinctOn ordered by id first).
    rows.sort(
      (a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0),
    );
    return { notifications: rows };
  });
}
