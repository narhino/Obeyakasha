import { and, desc, eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { consents, users } from "@/lib/db/schema";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { Display } from "@/components/ui";

export default async function SettingsPage() {
  const session = await requireSubject();
  const [me] = await db
    .select({
      timezone: users.timezone,
      qs: users.quietHoursStart,
      qe: users.quietHoursEnd,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // Theme opt-outs are append-only consent records; the latest is the truth.
  // Load it so the chips reflect what she already agreed never to touch (F23).
  const [latestOptout] = await db
    .select({ payload: consents.payload })
    .from(consents)
    .where(
      and(
        eq(consents.userId, session.user.id),
        eq(consents.kind, "theme_optout"),
      ),
    )
    .orderBy(desc(consents.createdAt))
    .limit(1);
  const initialOptouts = Array.isArray(
    (latestOptout?.payload as { themes?: unknown })?.themes,
  )
    ? ((latestOptout!.payload as { themes: string[] }).themes)
    : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display size="opener">Settings</Display>
      <SettingsClient
        timezone={me?.timezone ?? "UTC"}
        quietStart={me?.qs ?? 22}
        quietEnd={me?.qe ?? 9}
        initialOptouts={initialOptouts}
      />
    </main>
  );
}
