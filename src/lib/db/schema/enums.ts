import { pgEnum } from "drizzle-orm/pg-core";

// Identity & access
export const userRole = pgEnum("user_role", ["subject", "goddess"]);
export const userStatus = pgEnum("user_status", ["active", "frozen", "banned"]);
export const entitlementSource = pgEnum("entitlement_source", [
  "patreon",
  "grant",
]);
export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "grace",
  "frozen",
]);
export const consentKind = pgEnum("consent_kind", [
  "age",
  "hypnosis_terms",
  "privacy",
  "theme_optout",
]);
export const devicePlatform = pgEnum("device_platform", [
  "ios",
  "android",
  "desktop",
]);

// Content
export const trackVisibility = pgEnum("track_visibility", [
  "draft",
  "published",
  "archived",
]);
export const trackKind = pgEnum("track_kind", [
  "session",
  "whisper_audio",
  "emergence",
  "spiral_audio",
]);
export const trackSource = pgEnum("track_source", ["upload", "patreon_import"]);
export const transcriptStatus = pgEnum("transcript_status", [
  "queued",
  "processing",
  "done",
  "failed",
]);
export const tagKind = pgEnum("tag_kind", [
  "purpose",
  "theme",
  "format",
  "intensity",
  "custom",
]);
export const tagSource = pgEnum("tag_source", ["agent", "admin"]);
export const triggerRelation = pgEnum("trigger_relation", [
  "installs",
  "reinforces",
  "requires",
]);
export const programGating = pgEnum("program_gating", [
  "sequential",
  "daily",
  "open",
]);
export const playlistKind = pgEnum("playlist_kind", ["curated", "system"]);
export const reviewKind = pgEnum("review_kind", [
  "tags",
  "triggers",
  "playlist",
  "wish_cluster",
]);
export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "edited",
  "rejected",
]);

// Listening & progression
export const listenEndReason = pgEnum("listen_end_reason", [
  "finished",
  "stopped",
  "grounded",
  "abandoned",
]);
export const chainEventKind = pgEnum("chain_event_kind", ["listen", "mantra"]);
export const milestoneKind = pgEnum("milestone_kind", [
  "days_30",
  "days_90",
  "days_365",
  "listens_100",
  "program_done",
]);

// Relationship
export const orderRequires = pgEnum("order_requires", ["ack", "text", "none"]);
export const orderStatus = pgEnum("order_status", [
  "sent",
  "seen",
  "done",
  "lapsed",
]);
export const pollStatus = pgEnum("poll_status", ["open", "closed"]);
export const questionKind = pgEnum("question_kind", ["intake", "ritual"]);
export const messageSender = pgEnum("message_sender", ["subject", "goddess"]);
export const aiDraftStatus = pgEnum("ai_draft_status", [
  "proposed",
  "used",
  "edited",
  "discarded",
]);
export const voiceCorpusSource = pgEnum("voice_corpus_source", [
  "sent_reply",
  "script",
  "manual",
]);
export const wishSource = pgEnum("wish_source", ["intake", "wishbox"]);
export const wishStatus = pgEnum("wish_status", [
  "new",
  "clustered",
  "planned",
  "shipped",
  "declined",
]);
export const commissionStatus = pgEnum("commission_status", [
  "new",
  "reviewing",
  "accepted",
  "in_progress",
  "delivered",
  "declined",
  "closed",
]);
export const notificationKind = pgEnum("notification_kind", [
  "manual",
  "automation",
  "system",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "queued",
  "sent",
  "failed",
  "clicked",
]);
export const automationTrigger = pgEnum("automation_trigger", [
  "inactive_days",
  "new_track",
  "program_day_unlocked",
  "chain_broken",
  "anniversary",
  "lapse",
]);
