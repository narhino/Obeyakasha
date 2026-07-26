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
export const trackSource = pgEnum("track_source", [
  "upload",
  "patreon_import",
  // F1: a file a subject brought of their own — private to its owner (D7).
  "subject_upload",
]);
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
// Cadence shown to subjects on a training/series (ROADMAP-v1.5)
export const programCadence = pgEnum("program_cadence", [
  "ongoing",
  "weekly",
  "ended",
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
// Photo-proof requirement per order (R5): off by default, her per-order dial.
export const proofMode = pgEnum("proof_mode", ["none", "optional", "required"]);
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
// Production stage shown to the buyer as a progress bar (ROADMAP-v1.5)
export const commissionStage = pgEnum("commission_stage", [
  "queued",
  "script",
  "voice",
  "editing",
  "mastering",
  "delivered",
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

// Durable job queue (ROADMAP-v1.5 C1.1)
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "done",
  "failed",
]);

// Per-track content pipeline (ROADMAP-v1.5 C1.3)
export const pipelineStatus = pgEnum("pipeline_status", [
  "uploaded",
  "transcribing",
  "organizing",
  "ready",
  "failed_transcribe",
  "failed_organize",
]);

// First-party visitor analytics (A21). The device BUCKET is all we ever keep —
// the raw user-agent string is parsed at the edge of the request and discarded.
export const visitorDevice = pgEnum("visitor_device", [
  "mobile",
  "tablet",
  "desktop",
]);
