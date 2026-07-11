import "dotenv/config";
import { db } from "../src/lib/db";
import { settings, tags, triggers } from "../src/lib/db/schema";
import { SETTINGS_DEFAULTS } from "../src/lib/settings";

/**
 * Seed ADMIN-CONFIG settings + a starter tag/trigger vocabulary drawn from
 * Akasha's real catalog (docs/BRAND.md). Idempotent.
 */
async function main() {
  console.log("Seeding settings…");
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoNothing({ target: settings.key });
  }

  console.log("Seeding starter tag vocabulary…");
  const starterTags: { kind: "purpose" | "theme" | "format" | "intensity"; value: string }[] = [
    { kind: "purpose", value: "induction" },
    { kind: "purpose", value: "deepening" },
    { kind: "purpose", value: "conditioning" },
    { kind: "purpose", value: "trigger" },
    { kind: "purpose", value: "maintenance" },
    { kind: "purpose", value: "sleep" },
    { kind: "theme", value: "chastity" },
    { kind: "theme", value: "obedience" },
    { kind: "theme", value: "devotion" },
    { kind: "theme", value: "transformation" },
    { kind: "theme", value: "worship" },
    { kind: "format", value: "pure hypnosis" },
    { kind: "format", value: "roleplay" },
    { kind: "intensity", value: "gentle" },
    { kind: "intensity", value: "deep" },
    { kind: "intensity", value: "intense" },
  ];
  for (const t of starterTags) {
    await db.insert(tags).values(t).onConflictDoNothing();
  }

  console.log("Seeding starter triggers…");
  const starterTriggers = [
    { name: "Drop", slug: "drop", description: "Instant trance-drop anchor." },
    { name: "The Clicker", slug: "clicker", description: "Clicker conditioning anchor." },
    { name: "Good boy", slug: "good-boy", description: "Praise reinforcement anchor." },
  ];
  for (const t of starterTriggers) {
    await db.insert(triggers).values(t).onConflictDoNothing({ target: triggers.slug });
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
