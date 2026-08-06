import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { selfHeal } from "@/lib/patreon/selfheal";
import { db } from "@/lib/db";

/**
 * The pulse — "has anything changed?" in one tiny query.
 *
 * The app used to stay fresh by blindly re-running the WHOLE current route
 * every 30 seconds: every server component, every database query on that page,
 * whether or not a single thing had moved. That is both slow to feel (up to
 * half a minute before a new whisper appears) and expensive to do often, so it
 * could not simply be sped up — polling a 178 KB page every few seconds would
 * have made the server the problem instead.
 *
 * This returns a few hundred bytes and one round trip of indexed `max()`s. The
 * client polls it every few seconds and only pays for a real refresh when the
 * value actually changes. Faster AND cheaper than what it replaces.
 *
 * Role-aware on purpose: the goddess and a subject wait on completely different
 * things, and a subject must never learn anything about another subject from
 * this (D7) — every value here is either global (a published whisper) or their
 * own. The response is an opaque digest, so even the shape leaks nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Collapse the row of timestamps/counts into one short opaque token. */
function digest(parts: unknown[]): string {
  const raw = parts
    .map((p) => (p instanceof Date ? p.getTime() : (p ?? "")))
    .join("|");
  // A cheap non-cryptographic hash — this is a change detector, not a secret.
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    // Logged-out: only the public feed can change under them.
    const rows = await db.execute(sql`
      select (select max(published_at) from whispers) as w
    `);
    const r = rows[0] as { w: Date | null };
    return Response.json(
      { v: digest([r?.w]) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const uid = session.user.id;

  if (session.user.role === "goddess") {
    // What she actually sits waiting on: someone writing to her, a new ask, a
    // commission, a comment under a whisper, and the content pipeline she
    // watches most (transcription finishing).
    const rows = await db.execute(sql`
      select
        (select max(created_at) from messages where sender = 'subject') as m,
        (select count(*) from messages where sender = 'subject' and read_at is null) as unread,
        (select max(created_at) from wishes) as w,
        (select max(created_at) from commissions) as c,
        (select max(created_at) from whisper_comments) as wc,
        (select max(updated_at) from jobs) as j,
        (select max(created_at) from users where role = 'subject') as u,
        (select max(updated_at) from tracks) as t
    `);
    const r = rows[0] as Record<string, unknown>;
    return Response.json(
      { v: digest([r?.m, r?.unread, r?.w, r?.c, r?.wc, r?.j, r?.u, r?.t]) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // While they're here, quietly re-check what they're paying. Someone who
  // upgrades or resumes on Patreon never signs in again — their cookie is still
  // good — so without this nothing ever re-reads their standing and they stay
  // marked frozen while paying. It costs two indexed rows and almost always
  // decides to do nothing; a frozen member is the one it actually works for.
  const healed = await selfHeal(uid).catch(() => null);

  // A subject waits on: her voice (a whisper, a message to them, an answered
  // ask), a task landing, and whether she is on the app right now. Every read
  // is scoped to this user or global — never another subject's anything (D7).
  const rows = await db.execute(sql`
    select
      (select max(published_at) from whispers) as w,
      (select max(created_at) from messages mm
         join threads th on th.id = mm.thread_id
        where th.user_id = ${uid} and mm.sender = 'goddess') as m,
      (select count(*) from messages mm
         join threads th on th.id = mm.thread_id
        where th.user_id = ${uid} and mm.sender = 'goddess' and mm.read_at is null) as unread,
      (select max(updated_at) from order_assignments where user_id = ${uid}) as o,
      (select max(replied_at) from wishes where user_id = ${uid}) as a,
      (select max(created_at) from notifications) as n,
      (select max(last_seen_at) from users where role = 'goddess') as g
  `);
  const r = rows[0] as Record<string, unknown>;
  return Response.json(
    // `restored` is folded into the digest so the page they're looking at
    // refreshes the instant their access comes back — they should see the
    // library unseal itself, not have to guess and reload.
    {
      v: digest([r?.w, r?.m, r?.unread, r?.o, r?.a, r?.n, r?.g, healed?.restored]),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
