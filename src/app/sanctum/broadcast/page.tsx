import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  notificationDeliveries,
  users,
} from "@/lib/db/schema";
import { pushConfigured } from "@/lib/push/send";
import {
  Badge,
  Button,
  Card,
  Display,
  Input,
  Select,
  Whisper,
} from "@/components/ui";
import { sendBroadcast } from "./actions";

export default async function BroadcastPage() {
  const [subjects, recent] = await Promise.all([
    db
      .select({ id: users.id, name: users.chosenName, email: users.email })
      .from(users)
      .where(eq(users.role, "subject"))
      .limit(200),
    db
      .select({
        id: notifications.id,
        title: notifications.title,
        sentAt: notifications.sentAt,
        sent: sql<number>`count(*) filter (where ${notificationDeliveries.status} = 'sent')::int`,
        total: sql<number>`count(${notificationDeliveries.userId})::int`,
      })
      .from(notifications)
      .leftJoin(
        notificationDeliveries,
        eq(notificationDeliveries.notificationId, notifications.id),
      )
      .groupBy(notifications.id)
      .orderBy(desc(notifications.sentAt))
      .limit(15),
  ]);

  const configured = pushConfigured();

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Broadcast</Display>
      <Whisper className="mt-1">
        Speak to all of them, a tier, or one subject. {"{name}"} and{" "}
        {"{honorific}"} personalize per subject.
      </Whisper>

      {!configured ? (
        <Card className="mt-4 border-danger/40">
          <Whisper>
            Push isn&apos;t configured yet — messages will be recorded but not
            delivered. Add VAPID keys to your <code>.env</code> (see
            docs/DEPLOY.md), then redeploy.
          </Whisper>
        </Card>
      ) : null}

      <Card className="mt-6">
        <form action={sendBroadcast} className="space-y-4">
          <label className="block">
            <span className="text-xs text-text-dim">Title</span>
            <Input name="title" required maxLength={120} className="mt-1 w-full" />
          </label>
          <label className="block">
            <span className="text-xs text-text-dim">Body (optional)</span>
            <Input name="body" maxLength={300} className="mt-1 w-full" />
          </label>
          <label className="block">
            <span className="text-xs text-text-dim">
              Opens (deep link, e.g. /library)
            </span>
            <Input name="deepLink" defaultValue="/library" className="mt-1 w-full" />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-text-dim">To</span>
              <Select name="audienceType" defaultValue="all" className="mt-1 w-full">
                <option value="all">Everyone</option>
                <option value="level">Access level ≥</option>
                <option value="oath">The Collared</option>
                <option value="user">One subject</option>
              </Select>
            </label>
            <label className="block">
              <span className="text-xs text-text-dim">Level (if tier)</span>
              <Input name="level" type="number" min={0} max={99} defaultValue={1} className="mt-1 w-full" />
            </label>
            <label className="block">
              <span className="text-xs text-text-dim">Subject (if one)</span>
              <Select name="userId" className="mt-1 w-full">
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.email ?? s.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-dim">
            <input type="checkbox" name="respectQuietHours" defaultChecked />
            Respect quiet hours (hold back subjects who are asleep)
          </label>

          <Button type="submit" variant="gold">
            Send
          </Button>
        </form>
      </Card>

      <Display as="h2" className="mt-10 text-xl">
        Recent
      </Display>
      <div className="mt-3 space-y-2">
        {recent.length === 0 ? (
          <Whisper>Nothing sent yet.</Whisper>
        ) : (
          recent.map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-text">{r.title}</p>
                <Whisper className="text-xs">
                  {r.sentAt
                    ? r.sentAt.toISOString().replace("T", " ").slice(0, 16)
                    : "—"}
                </Whisper>
              </div>
              <Badge tone="gold">
                {r.sent}/{r.total} delivered
              </Badge>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
