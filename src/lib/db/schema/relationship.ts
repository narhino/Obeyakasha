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
  proofMode,
  questionKind,
  voiceCorpusSource,
  wishSource,
  wishStatus,
} from "./enums";

/** Audience selector shape used across whispers / orders / polls / notifications. */
export type Audience =
  | { type: "public" } // visible to logged-out visitors too (R1 public front door)
  | { type: "all" }
  | { type: "level"; level: number }
  | { type: "oath" } // the collared inner circle — subjects with oathAt set (R9.5)
  | { type: "segment"; rule: Record<string, unknown> }
  | { type: "users"; userIds: string[] };

// ── Whispers (A11) ─────────────────────────────────────────────────────────
export const whispers = pgTable(
  "whispers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    body: text("body"),
    // SET NULL, not cascade: deleting the attached track just detaches it — the
    // whisper (its body / image / poll) survives with no audio. Column nullable.
    audioTrackId: uuid("audio_track_id").references(() => tracks.id, {
      onDelete: "set null",
    }),
    imageKey: text("image_key"),
    audience: jsonb("audience").$type<Audience>().notNull(),
    // R1: pinned whispers sort first everywhere (her toggle in the Sanctum).
    pinned: boolean("pinned").notNull().default(false),
    // R1: a whisper may carry a poll, rendered + voted inline in the feed.
    pollId: uuid("poll_id").references(() => polls.id),
    // R9.9a: when set with a null publishedAt, the whisper is scheduled — the
    // worker publishes it (sets publishedAt + fires the push) once this time
    // passes. Feed queries filter on publishedAt, so it stays invisible until then.
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whispers_published_idx").on(t.publishedAt),
    index("whispers_pinned_idx").on(t.pinned, t.publishedAt),
  ],
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

// ── Loves (F3) ───────────────────────────────────────────────────────────
// A subject's single love on a whisper — a toggle, one per (whisper, subject).
// Everyone (incl. logged-out) may see the AGGREGATE count in her voice; the
// membership (who) is NEVER exposed to anyone but the goddess (D7). The PK
// enforces one-per-subject; both FKs cascade so releasing an account or
// deleting a whisper takes its loves with it.
export const whisperLoves = pgTable(
  "whisper_loves",
  {
    whisperId: uuid("whisper_id")
      .notNull()
      .references(() => whispers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.whisperId, t.userId] })],
);

// ── Comments (F3) ────────────────────────────────────────────────────────
// A subject speaks privately under a whisper. STRICTLY her <-> that one subject
// (D7, absolute): a comment is visible ONLY to its author and to the goddess —
// never to any other subject, and no other subject may ever perceive its count.
// `readAt` records that she has seen it; `replyMessageId` links the reply she
// dropped into the subject's Messages thread (the whisper thread mirrors it).
export const whisperComments = pgTable(
  "whisper_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    whisperId: uuid("whisper_id")
      .notNull()
      .references(() => whispers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Her reply lives as a real message in the subject's thread; this points at
    // it. ON DELETE SET NULL so pruning a message never orphans the comment row.
    replyMessageId: uuid("reply_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("whisper_comments_whisper_idx").on(t.whisperId),
    index("whisper_comments_user_idx").on(t.userId),
  ],
);

// ── Orders (A12) ─────────────────────────────────────────────────────────
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  audience: jsonb("audience").$type<Audience>().notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  requires: orderRequires("requires").notNull().default("ack"),
  // R5: whether a photo proof is asked for on completion (her per-order dial).
  proofMode: proofMode("proof_mode").notNull().default("none"),
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
    // R5: photo proof lives in media storage; the key is never exposed raw —
    // it's served through the signed-URL pattern like artwork.
    proofKey: text("proof_key"),
    // When the proof was attached — orders the Sanctum review strip newest-first.
    proofAt: timestamp("proof_at", { withTimezone: true }),
    // Set when the goddess praises the proof (gold seal + a push to that subject).
    praisedAt: timestamp("praised_at", { withTimezone: true }),
    // R7: set once the worker has pushed the 24h deadline warning for this
    // assignment — the guard that stops the hourly tick re-warning the same task.
    deadlineWarnedAt: timestamp("deadline_warned_at", { withTimezone: true }),
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
  // R6 Ask ("Petition her"): a short headline for the petition. Nullable so
  // pre-R6 wishes (intake / wishbox) keep working untouched.
  title: text("title"),
  body: text("body").notNull(),
  source: wishSource("source").notNull().default("wishbox"),
  status: wishStatus("status").notNull().default("new"),
  // R6: her answer to the petition. Set from the Sanctum wishes board; when it
  // lands, the subject is pushed ("She answered your petition.").
  reply: text("reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wishClusters = pgTable("wish_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  wishIds: jsonb("wish_ids").$type<string[]>().notNull().default([]),
  status: wishStatus("status").notNull().default("clustered"),
  // SET NULL: deleting the shipped track detaches it; the cluster/answer stays.
  shippedTrackId: uuid("shipped_track_id").references(() => tracks.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Commissions (F3 request flow, D2) ────────────────────────────────────
// A commission may come from a SUBJECT (userId) or from a stranger who has not
// connected Patreon yet (guestEmail). Exactly one identity is required, and the
// invariant is enforced in code — `assertCommissionIdentity` in
// `src/lib/commissions/ops.ts` is the single writing gate. Drizzle has no
// portable CHECK helper here, so the code guard IS the constraint; every insert
// path (subject route, guest route, tests) goes through it.
//
// D7: a guest row has a NULL userId, so every subject-facing read —
// `getUserCommissions`, `hasActiveCommission` — silently excludes it (NULL never
// equals a uuid). No subject can ever perceive that a stranger asked her.
export const commissions = pgTable("commissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  // NULLABLE for guests. The FK + cascade still hold for real accounts, so
  // releasing an account still takes its commissions with it.
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  /** Guest reply address — the ONLY way she can answer someone with no account. */
  guestEmail: text("guest_email"),
  /** What the guest asked to be called (optional; the email is the identity). */
  guestName: text("guest_name"),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
  status: commissionStatus("status").notNull().default("new"),
  stage: commissionStage("stage").notNull().default("queued"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  waitlist: boolean("waitlist").notNull().default(false),
  adminNotes: text("admin_notes"),
  // SET NULL: deleting the delivered track detaches it; the commission stays.
  deliveredTrackId: uuid("delivered_track_id").references(() => tracks.id, {
    onDelete: "set null",
  }),
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

// ── Moments: in-app ritual pop-ups at next session (R7) ──────────────────
// A durable queue of subject-facing "moments" (rank-up, praised, …). Written
// alongside the matching push so a subject who missed the notification still
// meets the ritual on their next visit. `shownAt` is null until dismissed;
// it also serves as the rank-up ledger (the latest rank_up row's payload is the
// last rank we recorded for a subject).
export const moments = pgTable(
  "moments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
  },
  (t) => [index("moments_user_shown_idx").on(t.userId, t.shownAt)],
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
