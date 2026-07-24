import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import {
  pipelineStatus,
  programCadence,
  programGating,
  playlistKind,
  reviewKind,
  reviewStatus,
  tagKind,
  tagSource,
  trackKind,
  trackSource,
  trackVisibility,
  transcriptStatus,
  triggerRelation,
} from "./enums";

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    durationS: integer("duration_s"),
    storageKey: text("storage_key"),
    streamKey: text("stream_key"),
    artworkKey: text("artwork_key"),
    // Stored size of the original bytes. Recorded at ingest; drives the Sanctum
    // "Their files" storage footprint per subject (F1). Null for legacy rows.
    sizeBytes: integer("size_bytes"),
    waveform: jsonb("waveform").$type<number[]>(),
    minAccessLevel: integer("min_access_level").notNull().default(1),
    downloadable: boolean("downloadable").notNull().default(true),
    // R9.8 free samples: a published track flagged here streams to ANYONE
    // (logged-out included) — the public free-funnel taste. Access checks defer
    // to this before sealing (src/app/api/tracks/[id]/stream-url).
    freeSample: boolean("free_sample").notNull().default(false),
    visibility: trackVisibility("visibility").notNull().default("draft"),
    kind: trackKind("kind").notNull().default("session"),
    pipeline: pipelineStatus("pipeline").notNull().default("uploaded"),
    // Premieres (R9.6): a published track with a future premiereAt is VISIBLE in
    // the catalog + file page but sealed from playback until its moment — a
    // countdown, not a lock. The stream endpoint refuses it while future (even
    // for the entitled and for free samples). premiereAnnouncedAt is the guard
    // the worker stamps once it has pushed the "it's time" appointment, so the
    // announce fires exactly once.
    premiereAt: timestamp("premiere_at", { withTimezone: true }),
    premiereAnnouncedAt: timestamp("premiere_announced_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    source: trackSource("source").notNull().default("upload"),
    patreonPostId: text("patreon_post_id"),
    // F1 "subjects bring their own files": when set, this track is a subject's
    // PRIVATE personal upload — visible & streamable ONLY to this owner and to
    // the goddess (D7, absolute). Null for the whole public catalog. The shared
    // predicate `notSomeoneElses()` gates every subject-reachable track read on
    // it. ON DELETE CASCADE: releasing an account takes their files with it.
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tracks_visibility_idx").on(t.visibility),
    index("tracks_owner_idx").on(t.ownerUserId),
  ],
);

// Transcripts: ADMIN-ONLY (never shipped to subject clients). PLAN §8.
export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  trackId: uuid("track_id")
    .notNull()
    .unique()
    .references(() => tracks.id, { onDelete: "cascade" }),
  status: transcriptStatus("status").notNull().default("queued"),
  language: text("language"),
  segments: jsonb("segments").$type<
    { start: number; end: number; text: string }[]
  >(),
  fullText: text("full_text"),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: tagKind("kind").notNull(),
    value: text("value").notNull(),
  },
  (t) => [unique("tags_kind_value_uq").on(t.kind, t.value)],
);

export const trackTags = pgTable(
  "track_tags",
  {
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    source: tagSource("source").notNull().default("admin"),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.tagId] })],
);

export const triggers = pgTable("triggers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  safetyNotes: text("safety_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const trackTriggers = pgTable(
  "track_triggers",
  {
    trackId: uuid("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => triggers.id, { onDelete: "cascade" }),
    relation: triggerRelation("relation").notNull(),
    timestamps: jsonb("timestamps").$type<
      { start: number; end: number; phrase: string }[]
    >(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.triggerId, t.relation] })],
);

// Written on qualifying completion (PLAN §8.4)
export const userTriggers = pgTable(
  "user_triggers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => triggers.id, { onDelete: "cascade" }),
    // SET NULL: this is only provenance ("acquired via this track"). Deleting the
    // track must not block — the subject keeps the trigger, we lose the link.
    acquiredViaTrackId: uuid("acquired_via_track_id").references(
      () => tracks.id,
      { onDelete: "set null" },
    ),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.triggerId] })],
);

export const programs = pgTable("programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  artworkKey: text("artwork_key"),
  minAccessLevel: integer("min_access_level").notNull().default(1),
  gating: programGating("gating").notNull().default("sequential"),
  cadence: programCadence("cadence").notNull().default("ongoing"),
  visibility: trackVisibility("visibility").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const programItems = pgTable("program_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  trackId: uuid("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number"),
  sort: integer("sort").notNull().default(0),
});

export const programProgress = pgTable(
  "program_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    itemCompleted: jsonb("item_completed").$type<number[]>().notNull().default([]),
    currentDay: integer("current_day").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.programId] })],
);

export const playlists = pgTable("playlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  artworkKey: text("artwork_key"),
  visibility: trackVisibility("visibility").notNull().default("draft"),
  kind: playlistKind("kind").notNull().default("curated"),
  // Cadence shown to subjects on a series (R4) — reuses the program enum.
  cadence: programCadence("cadence").notNull().default("ongoing"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playlistItems = pgTable("playlist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  playlistId: uuid("playlist_id")
    .notNull()
    .references(() => playlists.id, { onDelete: "cascade" }),
  trackId: uuid("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  sort: integer("sort").notNull().default(0),
});

// Organize agent proposals land here; nothing applies without approval (F5)
export const reviewQueue = pgTable(
  "review_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: reviewKind("kind").notNull(),
    subjectRef: jsonb("subject_ref").$type<Record<string, unknown>>(),
    proposal: jsonb("proposal").$type<Record<string, unknown>>(),
    agentRationale: text("agent_rationale"),
    status: reviewStatus("status").notNull().default("pending"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("review_queue_status_idx").on(t.status)],
);
