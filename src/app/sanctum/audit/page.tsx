import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { Card, PageHeading, Whisper } from "@/components/ui";

export default async function AuditPage() {
  const entries = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(100);

  return (
    <div className="max-w-2xl">
      <PageHeading eyebrow="System">Audit</PageHeading>
      <Whisper className="mt-1">
        Every mutation in the Sanctum, most recent first.
      </Whisper>

      {entries.length === 0 ? (
        <Card className="mt-6">
          <Whisper>Nothing recorded yet.</Whisper>
        </Card>
      ) : (
        <div className="mt-6 space-y-2">
          {entries.map((e) => (
            <Card key={e.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-text">{e.action}</span>
                <span className="text-xs text-text-dim">
                  {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </span>
              </div>
              {e.subject ? (
                <pre className="mt-2 overflow-x-auto rounded bg-bg p-2 text-xs text-text-dim">
                  {JSON.stringify(e.subject)}
                </pre>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
