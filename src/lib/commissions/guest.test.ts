import { beforeEach, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { commissions, users } from "@/lib/db/schema";
import { truncateAll } from "@/lib/test/db";
import { setSetting } from "@/lib/settings";
import {
  assertCommissionIdentity,
  getUserCommissions,
  submitGuestCommission,
} from "./ops";
import {
  DUPLICATE_WINDOW_MS,
  MAX_PER_WINDOW,
  WINDOW_MS,
  fingerprint,
  guardGuestSubmission,
  resetGuestThrottle,
} from "./throttle";

/**
 * The anonymous-commission guard (R-anon): the identity invariant that stands in
 * for the missing CHECK constraint, the abuse throttle on the new public write,
 * and the D7 promise that a stranger's petition is invisible to every subject.
 */

beforeEach(async () => {
  await truncateAll();
  await db.insert(users).values({ role: "goddess" }); // notifyGoddess needs one
  resetGuestThrottle();
});

describe("commission identity invariant", () => {
  it("refuses a row with neither an account nor a reply address", () => {
    expect(() => assertCommissionIdentity({})).toThrow(
      "commission_identity_required",
    );
    expect(() =>
      assertCommissionIdentity({ userId: null, guestEmail: "   " }),
    ).toThrow("commission_identity_required");
  });

  it("accepts either identity alone", () => {
    expect(() =>
      assertCommissionIdentity({ userId: "1f0e3b1e-0000-0000-0000-000000000000" }),
    ).not.toThrow();
    expect(() =>
      assertCommissionIdentity({ guestEmail: "someone@example.com" }),
    ).not.toThrow();
  });
});

describe("guest throttle", () => {
  const fp = (n: number) => `fingerprint-${n}`;

  it("allows the cap per IP per window, then refuses", () => {
    for (let i = 0; i < MAX_PER_WINDOW; i++) {
      expect(guardGuestSubmission("10.0.0.1", fp(i))).toBe("ok");
    }
    expect(guardGuestSubmission("10.0.0.1", fp(99))).toBe("throttled");
    // A different caller is untouched by someone else's flood.
    expect(guardGuestSubmission("10.0.0.2", fp(100))).toBe("ok");
  });

  it("frees the quota once the window has rolled past", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_PER_WINDOW; i++) {
      expect(guardGuestSubmission("10.0.0.3", fp(i), t0)).toBe("ok");
    }
    expect(guardGuestSubmission("10.0.0.3", fp(50), t0 + 1)).toBe("throttled");
    expect(guardGuestSubmission("10.0.0.3", fp(51), t0 + WINDOW_MS + 1)).toBe(
      "ok",
    );
  });

  it("swallows an identical petition inside the duplicate window without spending quota", () => {
    const t0 = 2_000_000;
    const same = fingerprint("Someone@Example.com ", { scenario: "x" });
    expect(guardGuestSubmission("10.0.0.4", same, t0)).toBe("ok");
    // Same email (case/whitespace insensitive) + same answers = one petition.
    const again = fingerprint("someone@example.com", { scenario: "x" });
    expect(guardGuestSubmission("10.0.0.4", again, t0 + 1_000)).toBe("duplicate");
    // The duplicate cost them nothing: the remaining quota is still there.
    expect(guardGuestSubmission("10.0.0.4", fp(1), t0 + 2_000)).toBe("ok");
    expect(guardGuestSubmission("10.0.0.4", fp(2), t0 + 3_000)).toBe("ok");
    // That IP's hourly quota is now spent — the duplicate never counted, the
    // three real ones did.
    expect(guardGuestSubmission("10.0.0.4", fp(3), t0 + 4_000)).toBe("throttled");
    // Past the duplicate window the same petition is a genuinely new one again
    // (checked from a fresh IP so the hourly cap can't confuse the result).
    expect(
      guardGuestSubmission("10.0.0.5", again, t0 + DUPLICATE_WINDOW_MS + 1),
    ).toBe("ok");
  });
});

describe("guest submissions", () => {
  it("obeys the sealed board and stays invisible to every subject (D7)", async () => {
    const [subject] = await db.insert(users).values({ role: "subject" }).returning();

    await setSetting("commissions_open", true);
    const open = await submitGuestCommission({
      email: "stranger@example.com",
      name: "  Stranger  ",
      answers: { scenario: "take me under" },
    });
    expect(open.waitlisted).toBe(false);

    // Sealed → the stranger lands on the waitlist, never on the live board.
    await setSetting("commissions_open", false);
    const sealed = await submitGuestCommission({
      email: "stranger@example.com",
      answers: { scenario: "again" },
    });
    expect(sealed.waitlisted).toBe(true);

    const guestRows = await db
      .select()
      .from(commissions)
      .where(isNull(commissions.userId));
    expect(guestRows).toHaveLength(2);
    expect(guestRows.every((r) => r.guestEmail === "stranger@example.com")).toBe(
      true,
    );
    expect(guestRows.some((r) => r.guestName === "Stranger")).toBe(true);
    expect(guestRows.some((r) => r.waitlist)).toBe(true);

    // D7: no subject-facing read can ever reach a guest row.
    expect(await getUserCommissions(subject!.id)).toHaveLength(0);
    const mine = await db
      .select()
      .from(commissions)
      .where(eq(commissions.userId, subject!.id));
    expect(mine).toHaveLength(0);
  });
});
