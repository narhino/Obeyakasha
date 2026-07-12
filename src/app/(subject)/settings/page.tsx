import { eq } from "drizzle-orm";
import { requireSubject } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Display className="text-3xl">Settings</Display>
      <SettingsClient
        timezone={me?.timezone ?? "UTC"}
        quietStart={me?.qs ?? 22}
        quietEnd={me?.qe ?? 9}
      />
    </main>
  );
}
