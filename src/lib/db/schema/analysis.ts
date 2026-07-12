import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tracks } from "./content";

/**
 * The durable per-track dossier (ROADMAP-v1.5 Phase D). One row per track — the
 * permanent, admin-only "nothing lost" ledger of everything the analyze agent
 * found: keywords, triggers, a suggested description, intended effects, safety
 * notes. Approving a finding into a real tag/trigger never deletes it here; it
 * only flips that finding's `status` inside the jsonb. Shape validated by
 * `analysisDossierSchema` (src/lib/analyze/schema.ts) at the app layer.
 */
export const trackAnalysis = pgTable("track_analysis", {
  trackId: uuid("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  model: text("model"),
  summary: text("summary"),
  keywords: jsonb("keywords").$type<unknown[]>().notNull().default([]),
  triggers: jsonb("triggers").$type<unknown[]>().notNull().default([]),
  suggestedTags: jsonb("suggested_tags").$type<unknown[]>().notNull().default([]),
  suggestedDescription: text("suggested_description"),
  intendedEffects: jsonb("intended_effects")
    .$type<string[]>()
    .notNull()
    .default([]),
  safetyNotes: text("safety_notes"),
  // Everything the agent returned, verbatim — including any original imported
  // description before a rewrite. Never thrown away.
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
