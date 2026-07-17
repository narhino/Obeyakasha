import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { programs, tracks } from "./content";
import { chainEventKind, listenEndReason, milestoneKind } from "./enums";

export const listenSessions = pgTable(
  "listen_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // R9.1 ("She sees you"): stamped on every heartbeat so the Sanctum live view
    // can tell who is under *right now* — a session with no endedAt whose last
    // heartbeat landed within the live window (see src/lib/listen/live.ts).
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    secondsListened: integer("seconds_listened").notNull().default(0),
    maxPositionS: integer("max_position_s").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    endReason: listenEndReason("end_reason"),
  },
  (t) => [
    index("listen_sessions_user_idx").on(t.userId),
    index("listen_sessions_track_idx").on(t.trackId),
  ],
);

export const dropReports = pgTable("drop_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  listenSessionId: uuid("listen_session_id")
    .notNull()
    .unique()
    .references(() => listenSessions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  trackId: uuid("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  depth: integer("depth").notNull(), // 1..5
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const resumePoints = pgTable(
  "resume_points",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    positionS: integer("position_s").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.trackId] })],
);

// Chain of Obedience (A7)
export const chains = pgTable("chains", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  currentLen: integer("current_len").notNull().default(0),
  bestLen: integer("best_len").notNull().default(0),
  lastKeptDate: date("last_kept_date"),
});

export const chainEvents = pgTable(
  "chain_events",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: chainEventKind("kind").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

// Ranks / The Descent (A6) — ADMIN-CONFIG
export const ranks = pgTable("ranks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  rule: jsonb("rule").$type<Record<string, unknown>>(),
});

export const userRanks = pgTable("user_ranks", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  rankId: uuid("rank_id").references(() => ranks.id),
  achievedAt: timestamp("achieved_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: milestoneKind("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  surfaced: boolean("surfaced").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
