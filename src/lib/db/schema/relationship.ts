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
import { users } from "./identity";
import { tracks } from "./content";
import {
  aiDraftStatus,
  automationTrigger,
  commissionStage,
  commissionStatus,
  deliveryStatus,
  messageSender,
  notificationKind,
  orderRequires,
  orderStatus,
  pollStatus,
  questionKind,
  voiceCorpusSource,
  wishSource,
  wishStatus,
} from "./enums";

/** Audience selector shape used across whispers / orders / polls / notifications. */
export type Audience =
  | { type: "all" }
  | { type: "level"; level: number }
  | { type: "segment"; rule: Record<string, unknown> }
  | { type: "users"; userIds: string[] };

// ── Whispers (A11) ─────────────────────────────────────────────────────────
export const whispers = pgTable(
  "whispers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    body: text("body"),
    audioTrackId: uuid("audio_track_id").references(() => tracks.id),
    imageKey: text("image_key"),
    audience: jsonb("audience").$type<Audience>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("whispers_published_idx").on(t.publishedAt)],
);

export const whisperReceipts = pgTable(
  "whisper_receipts",
  {
    whisperId: uuid("whisper_id")
      .notNull()
      .references(() => whispers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    kneltAt: timestamp("knelt_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.whisperId, t.userId] })],
);

// ── Orders (A12) ─────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  audience: jsonb("audience").$type<Audience>().notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  requires: orderRequires("requires").notNull().default("ack"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orderAssignments = pgTable(
  "order_assignments",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: orderStatus("status").notNull().default("sent"),
    response: text("response"),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.userId] })],
);

// ── Polls (A24) ────────────────────────────────────────────────────────────
export const polls = pgTable("polls", {
  id: uuid("id").defaultRandom().primaryKey(),
  question: text("question").notNull(),
  options: jsonb("options").$type<{ id: string; label: string }[]>().notNull(),
  audience: jsonb("audience").$type<Audience>().notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  anonymousToAdmin: boolean("anonymous_to_admin").notNull().default(false),
  resultsShared: boolean("results_shared").notNull().default(false),
  status: pollStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.userId] })],
);

// ── Questions: intake (F9) + ritual (F10) ────────────────────────────────
export const questions = pgTable("questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  prompt: text("prompt").notNull(),
  audience: jsonb("audience").$type<Audience>(),
  kind: questionKind("kind").notNull(),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const questionAnswers = pgTable("question_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  answer: text("answer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Messages: strictly her <-> subject (D7) ──────────────────────────────
export const threads = pgTable("threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    sender: messageSender("sender").notNull(),
    body: text("body"),
    audioKey: text("audio_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    flaggedSafety: boolean("flagged_safety").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("messages_thread_idx").on(t.threadId)],
);

export const aiDrafts = pgTable("ai_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  drafts: jsonb("drafts").$type<string[]>(),
  status: aiDraftStatus("status").notNull().default("proposed"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const voiceCorpus = pgTable("voice_corpus", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: voiceCorpusSource("source").notNull(),
  text: text("text").notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Wishes (A15) ─────────────────────────────────────────────────────────
export const wishes = pgTable("wishes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  source: wishSource("source").notNull().default("wishbox"),
  status: wishStatus("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wishClusters = pgTable("wish_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  wishIds: jsonb("wish_ids").$type<string[]>().notNull().default([]),
  status: wishStatus("status").notNull().default("clustered"),
  shippedTrackId: uuid("shipped_track_id").references(() => tracks.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Commissions (F3 request flow, D2) ────────────────────────────────────
export const commissions = pgTable("commissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  status: commissionStatus("status").notNull().default("new"),
  stage: commissionStage("stage").notNull().default("queued"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  waitlist: boolean("waitlist").notNull().default(false),
  adminNotes: text("admin_notes"),
  deliveredTrackId: uuid("delivered_track_id").references(() => tracks.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Notifications (F7) ───────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: notificationKind("kind").notNull().default("manual"),
  title: text("title").notNull(),
  body: text("body"),
  deepLink: text("deep_link"),
  audience: jsonb("audience").$type<Audience>().notNull(),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    status: deliveryStatus("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.notificationId, t.userId, t.deviceId],
    }),
  ],
);

// ── Automations (A13) + templates ────────────────────────────────────────
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  trigger: automationTrigger("trigger").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>(),
  templateId: uuid("template_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  titleTpl: text("title_tpl"),
  bodyTpl: text("body_tpl"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Settings (ADMIN-CONFIG feature flags & tunables) ─────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Audit log (every Sanctum mutation) ───────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  subject: jsonb("subject").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Analytics events (internal only, A21) ────────────────────────────────
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("analytics_events_name_idx").on(t.name)],
);

// ── Offline grants (D4 / §10) ────────────────────────────────────────────
export const offlineGrants = pgTable(
  "offline_grants",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    keyWrapped: text("key_wrapped").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.trackId, t.deviceId] })],
);
