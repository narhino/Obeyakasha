import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, entitlements, patreonLinks } from "@/lib/db/schema";
import { syncPatreonUser } from "./sync";

/**
 * Re-check ONE member against Patreon using THEIR OWN token.
 *
 * THE BUG THIS EXISTS FOR: `syncPatreonUser` ran at sign-in and nowhere else.
 * Someone who upgraded their pledge — or resumed one — never signed in again,
 * because their session cookie was still valid. So nothing re-read Patreon, and
 * the app went on showing the standing it had recorded weeks earlier. They had
 * paid MORE and were still marked frozen.
 *
 * The hourly roster sweep was the first answer, but it needs a creator token
 * configured on the server; if that is missing the sweep silently does nothing
 * and the member is stranded again. This path needs no creator token at all:
 * every member already granted an OAuth token that can read their own
 * membership, and it's stored. So the app can re-check the one person who
 * matters at the exact moment it matters — when they come back to use what
 * they just bought.
 *
 * Rate-limited by what's at stake. A frozen member is the expensive case: they
 * have paid and are locked out, and every minute of that is damage — so they
 * are re-checked every couple of minutes. Everyone else is fine either way, so
 * a few hours is plenty.
 */

const FROZEN_INTERVAL_MS = 2 * 60 * 1000;
const NORMAL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** A usable Patreon access token for this member, refreshed if it has expired. */
export async function memberToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "patreon")))
    .limit(1);
  if (!row?.access_token) return null;

  // 60s of slack: a token that expires mid-request is a token that fails.
  const expired =
    typeof row.expires_at === "number" &&
    row.expires_at * 1000 < Date.now() + 60_000;
  if (!expired) return row.access_token;

  if (!row.refresh_token) return null;
  const clientId = process.env.PATREON_CLIENT_ID;
  const clientSecret = process.env.PATREON_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://www.patreon.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[patreon] token refresh failed:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;

    await db
      .update(accounts)
      .set({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? row.refresh_token,
        expires_at: data.expires_in
          ? Math.floor(Date.now() / 1000) + data.expires_in
          : null,
      })
      .where(
        and(eq(accounts.provider, "patreon"), eq(accounts.providerAccountId, row.providerAccountId)),
      );
    return data.access_token;
  } catch (err) {
    console.error("[patreon] token refresh threw:", err);
    return null;
  }
}

export interface SelfHealResult {
  /** Whether Patreon was actually asked this time. */
  checked: boolean;
  /** Their standing after the check (or the stored one if not checked). */
  frozen: boolean;
  /** True when this check is what un-froze them. */
  restored: boolean;
}

/**
 * Re-check this member if enough time has passed. Cheap and safe to call on
 * every poll: it reads two indexed rows and usually decides to do nothing.
 */
export async function selfHeal(userId: string): Promise<SelfHealResult> {
  const [ent] = await db
    .select({ status: entitlements.status })
    .from(entitlements)
    .where(
      and(eq(entitlements.userId, userId), eq(entitlements.source, "patreon")),
    )
    .limit(1);
  const wasFrozen = ent?.status === "frozen";

  const [link] = await db
    .select({ lastSyncedAt: patreonLinks.lastSyncedAt })
    .from(patreonLinks)
    .where(eq(patreonLinks.userId, userId))
    .limit(1);
  // Never linked = nothing to re-check (a manually imported shell, say).
  if (!link) return { checked: false, frozen: wasFrozen, restored: false };

  const interval = wasFrozen ? FROZEN_INTERVAL_MS : NORMAL_INTERVAL_MS;
  const age = link.lastSyncedAt
    ? Date.now() - link.lastSyncedAt.getTime()
    : Infinity;
  if (age < interval) return { checked: false, frozen: wasFrozen, restored: false };

  const token = await memberToken(userId);
  if (!token) return { checked: false, frozen: wasFrozen, restored: false };

  try {
    await syncPatreonUser({ userId, accessToken: token, isGoddess: false });
  } catch (err) {
    console.error("[patreon] self-heal failed for", userId, err);
    return { checked: false, frozen: wasFrozen, restored: false };
  }

  const [after] = await db
    .select({ status: entitlements.status })
    .from(entitlements)
    .where(
      and(eq(entitlements.userId, userId), eq(entitlements.source, "patreon")),
    )
    .limit(1);
  const nowFrozen = after?.status === "frozen";
  return {
    checked: true,
    frozen: nowFrozen,
    restored: wasFrozen && !nowFrozen,
  };
}

/** Force a re-check now, ignoring the interval. Behind a member's own button. */
export async function selfHealNow(userId: string): Promise<SelfHealResult> {
  await db
    .update(patreonLinks)
    .set({ lastSyncedAt: null })
    .where(eq(patreonLinks.userId, userId));
  return selfHeal(userId);
}

/**
 * Sweep every frozen member using their OWN tokens.
 *
 * The roster sweep is better when it can run, but it needs a creator token on
 * the server; if that is missing it does nothing and says nothing, and every
 * frozen member stays frozen forever. This is the floor beneath it: it needs
 * no creator token, only the tokens members already granted at sign-in.
 *
 * Frozen only, and oldest-checked first. Someone marked frozen is either
 * genuinely gone — in which case one API call confirms it and costs nothing —
 * or they are paying right now and locked out, which is the case worth every
 * call this makes. `limit` keeps one tick bounded; the next tick takes the next
 * batch, so a large membership drains over a few passes instead of hammering
 * Patreon in one burst.
 */
export async function sweepFrozen(limit = 25): Promise<{
  checked: number;
  restored: number;
}> {
  const rows = await db
    .select({ userId: entitlements.userId })
    .from(entitlements)
    .innerJoin(patreonLinks, eq(patreonLinks.userId, entitlements.userId))
    .where(
      and(eq(entitlements.source, "patreon"), eq(entitlements.status, "frozen")),
    )
    .orderBy(asc(patreonLinks.lastSyncedAt))
    .limit(limit);

  let checked = 0;
  let restored = 0;
  for (const row of rows) {
    const r = await selfHeal(row.userId);
    if (r.checked) checked++;
    if (r.restored) {
      restored++;
      console.log(`[patreon] self-heal restored access for ${row.userId}`);
    }
  }
  return { checked, restored };
}
