import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import {
  consentKind,
  devicePlatform,
  entitlementSource,
  entitlementStatus,
  userRole,
  userStatus,
} from "./enums";

// ── Auth.js adapter tables (standard shape, users extended) ───────────────
export const users = pgTable(
  "users",
  {
  id: uuid("id").defaultRandom().primaryKey(),
  // Auth.js standard columns
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  // Platform extensions (PLAN §5.1)
  role: userRole("role").notNull().default("subject"),
  chosenName: text("chosen_name"),
  honorific: text("honorific"),
  pronouns: text("pronouns"),
  renamedByGoddess: boolean("renamed_by_goddess").notNull().default(false),
  timezone: text("timezone").notNull().default("UTC"),
  quietHoursStart: integer("quiet_hours_start").notNull().default(22),
  quietHoursEnd: integer("quiet_hours_end").notNull().default(9),
  // Secret mode (R6): when on, every push to this subject is rewritten to an
  // innocuous family-safe message at the send choke point and the PWA manifest
  // serves a neutral identity. The in-app experience is unchanged.
  disguiseMode: boolean("disguise_mode").notNull().default(false),
  // The Oath (R9.5) — the collar. `oathPetitionedAt` is stamped when a
  // streak-eligible subject petitions to be collared; `oathAt` when she accepts.
  // A non-null oathAt is the inner circle: the "oath" audience + the monthly
  // gift reach exactly these. Both null = uncollared, never asked.
  oathPetitionedAt: timestamp("oath_petitioned_at", { withTimezone: true }),
  oathAt: timestamp("oath_at", { withTimezone: true }),
  status: userStatus("status").notNull().default("active"),
  // F4 presence: refreshed by the /api/presence heartbeat (any signed-in role).
  // Indexed — the Sanctum "In the room" view and the goddess-online check both
  // filter users by a recent lastSeenAt.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // F5 the red attention system: stamped to "now" each time the subject opens
  // the Whispers feed. The Whispers nav tab burns red when a whisper (or her
  // reply to one of their comments) has landed since — no existing per-feed
  // "seen" marker existed (receipts only record a kneel), so this is the cheap
  // one. Cleared by visiting `/`.
  lastSeenWhispersAt: timestamp("last_seen_whispers_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  },
  (t) => [index("users_last_seen_idx").on(t.lastSeenAt)],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── Patreon linkage ───────────────────────────────────────────────────────
export const patreonLinks = pgTable(
  "patreon_links",
  {
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    patreonUserId: text("patreon_user_id").notNull().unique(),
    campaignMember: boolean("campaign_member").notNull().default(false),
    currentlyEntitledTierIds: jsonb("currently_entitled_tier_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    patronStatus: text("patron_status"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("patreon_links_patreon_user_idx").on(t.patreonUserId)],
);

// ── Tier mapping (ADMIN-CONFIG) ───────────────────────────────────────────
export const tierMappings = pgTable("tier_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  patreonTierId: text("patreon_tier_id").notNull().unique(),
  label: text("label").notNull(),
  accessLevel: integer("access_level").notNull(),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Entitlements & grants ─────────────────────────────────────────────────
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessLevel: integer("access_level").notNull().default(0),
    source: entitlementSource("source").notNull(),
    status: entitlementStatus("status").notNull().default("active"),
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("entitlements_user_idx").on(t.userId)],
);

export const grants = pgTable("grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackId: uuid("track_id"),
  programId: uuid("program_id"),
  grantedBy: uuid("granted_by").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Consents (append-only) ────────────────────────────────────────────────
export const consents = pgTable("consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: consentKind("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Devices ───────────────────────────────────────────────────────────────
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: devicePlatform("platform").notNull(),
    pushSubscription: jsonb("push_subscription").$type<{
      endpoint: string;
      keys: { p256dh: string; auth: string };
    } | null>(),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    installed: boolean("installed").notNull().default(false),
    ua: text("ua"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);
