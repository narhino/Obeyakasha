import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { visitorDevice } from "./enums";

/**
 * First-party visitor analytics (A21) — the traffic ledger behind the Sanctum
 * dashboard. Nothing here leaves this server and no third party is ever called;
 * the whole point is that she can see her own funnel without renting it from
 * Google.
 *
 * WHAT IS DELIBERATELY NOT HERE, and never will be:
 *  · no IP address, in any form, hashed or otherwise;
 *  · no raw user-agent — the UA is bucketed to mobile/tablet/desktop while the
 *    request is still in memory and the string is dropped;
 *  · no full referrer URL — the HOST only, so a search query or a private forum
 *    thread title can never land in this table;
 *  · no query strings and no free-form paths — `path` is a NORMALIZED route
 *    PATTERN from a fixed allowlist (src/lib/analytics/core.ts), so a slug, an
 *    email in a link, or a one-off admin URL cannot become a row.
 *
 * `visitorId` is a random uuid the server mints into a first-party cookie. It
 * identifies a browser, not a person: it is not derived from anything about the
 * caller, it is never joined to identity except through `userId` (which the
 * visitor supplied by signing in), and it is dropped with the row at retention.
 *
 * RETENTION: rows older than the `analytics_retention_days` setting (400 by
 * default) are deleted by the worker's daily tick (src/lib/analytics/retention.ts).
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Random per-browser uuid from the first-party `oa_vid` cookie. */
    visitorId: text("visitor_id").notNull(),
    /**
     * SET NULL rather than cascade so the traffic history survives an account
     * release as anonymous rows. The delete route additionally removes this
     * subject's rows outright before the user row goes (GDPR erasure) — the FK
     * is the safety net, not the policy.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Normalized route pattern, e.g. `/library/track/[slug]`. Never raw. */
    path: text("path").notNull(),
    /** Referring HOST only (`example.com`), never a full URL. */
    referrerHost: text("referrer_host"),
    device: visitorDevice("device").notNull(),
    isSignedIn: boolean("is_signed_in").notNull().default(false),
    /**
     * Visible milliseconds spent on this view, filled in by a later beacon keyed
     * on the row id this insert returned. Monotonic (GREATEST) and clamped, so a
     * repeated beacon can only ever refine it upward to the clamp.
     */
    dwellMs: integer("dwell_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("page_views_created_idx").on(t.createdAt),
    index("page_views_path_idx").on(t.path),
    index("page_views_visitor_idx").on(t.visitorId),
    index("page_views_user_idx").on(t.userId),
  ],
);
