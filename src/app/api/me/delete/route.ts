import { eq } from "drizzle-orm";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { pageViews, users } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";

/**
 * "Release me" — hard-delete the account (A21 / GDPR). FK cascades remove the
 * subject's profile, consents, listens, messages, etc. An audit stub (no PII)
 * is retained. The goddess account cannot self-delete here.
 *
 * `page_views` is the one table that does NOT cascade — its FK is ON DELETE SET
 * NULL, so that traffic history survives a release as anonymous rows. "Deletion
 * is immediate and complete" is a promise, so their rows are deleted outright
 * FIRST, while the user id is still there to find them by.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role === "goddess") {
    return Response.json({ error: "cannot_delete_admin" }, { status: 400 });
  }
  await logAudit(null, "account.deleted", { at: new Date().toISOString() });
  await db.delete(pageViews).where(eq(pageViews.userId, session.user.id));
  await db.delete(users).where(eq(users.id, session.user.id));
  await signOut({ redirect: false });
  return Response.json({ ok: true });
}
