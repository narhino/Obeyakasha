import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tierMappings, tracks } from "@/lib/db/schema";
import { getRawSetting, getSetting } from "@/lib/settings";
import type { PatreonTier } from "@/lib/patreon/client";
import { Badge, Button, Card, Display, Input, Select, Whisper } from "@/components/ui";
import {
  saveTierMapping,
  setOathGiftTrack,
  setOathMinStreak,
  setOrganizeAutoApply,
  setPatreonPageUrl,
  setWelcomeDmText,
  toggleSetting,
} from "./actions";

export default async function AccessPage() {
  const [
    existing,
    discoveredTiers,
    automations,
    downloads,
    autoPipeline,
    autoApply,
    analysisEnabled,
    patreonPageUrl,
    welcomeEnabled,
    welcomeText,
    oathMinStreak,
    oathGiftTrackId,
    publishedTracks,
  ] = await Promise.all([
    db.select().from(tierMappings),
    getRawSetting<PatreonTier[]>("patreon_campaign_tiers", []),
    getSetting("automations_enabled"),
    getSetting("downloads_enabled"),
    getSetting("auto_pipeline"),
    getSetting("organize_auto_apply"),
    getSetting("analysis_enabled"),
    getRawSetting<string>("patreon_page_url", "https://www.patreon.com"),
    getSetting("welcome_dm_enabled"),
    getSetting("welcome_dm_text"),
    getSetting("oath_min_streak"),
    getRawSetting<string | null>("oath_gift_track_id", null),
    db
      .select({ id: tracks.id, title: tracks.title })
      .from(tracks)
      .where(eq(tracks.visibility, "published"))
      .limit(500),
  ]);

  const mappedById = new Map(existing.map((m) => [m.patreonTierId, m]));

  // Show discovered tiers first (with any saved mapping merged), then any
  // mapped tiers that are no longer discovered (kept for safety).
  const rows = [
    ...discoveredTiers.map((t) => ({
      tier: t,
      mapping: mappedById.get(t.id) ?? null,
    })),
    ...existing
      .filter((m) => !discoveredTiers.some((t) => t.id === m.patreonTierId))
      .map((m) => ({
        tier: {
          id: m.patreonTierId,
          title: m.label,
          amountCents: 0,
          patronCount: null,
        } as PatreonTier,
        mapping: m,
      })),
  ];

  return (
    <div className="max-w-2xl">
      <Display className="text-3xl">Settings</Display>
      <Whisper className="mt-1">
        Map each Patreon tier to an access level. Level 0 is the free Threshold;
        higher levels unlock more of the Library.
      </Whisper>

      {/* Upgrade link — where locked cards in the public catalog send subjects. */}
      <Card className="mt-6">
        <Whisper className="mb-3">Upgrade link</Whisper>
        <form
          action={setPatreonPageUrl}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Patreon page URL
            <Input
              name="url"
              type="url"
              defaultValue={patreonPageUrl}
              required
              className="w-80"
            />
          </label>
          <Button type="submit" size="sm" variant="gold">
            Save
          </Button>
        </form>
        <Whisper className="mt-2 text-xs">
          Locked cards in the public Library send subjects here to upgrade.
          Defaults to patreon.com.
        </Whisper>
      </Card>

      {discoveredTiers.length === 0 ? (
        <Card className="mt-6">
          <Whisper>
            No Patreon tiers discovered yet. Sign in with your creator Patreon
            account (with the <code>campaigns</code> scope) and your tiers will
            appear here automatically. Until then you can add mappings by hand
            below using each tier&apos;s Patreon tier id.
          </Whisper>
        </Card>
      ) : null}

      <div className="mt-6 space-y-3">
        {rows.map(({ tier, mapping }) => (
          <Card key={tier.id} raised>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-display)] text-lg">
                  {tier.title}
                </p>
                <Whisper className="text-xs">
                  {tier.amountCents > 0
                    ? `$${(tier.amountCents / 100).toFixed(2)}/mo · `
                    : ""}
                  id: {tier.id}
                </Whisper>
              </div>
              {mapping ? (
                <Badge tone="gold">level {mapping.accessLevel}</Badge>
              ) : (
                <Badge tone="sealed">unmapped</Badge>
              )}
            </div>

            <form
              action={saveTierMapping}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="patreonTierId" value={tier.id} />
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Label
                <Input
                  name="label"
                  defaultValue={mapping?.label ?? tier.title}
                  className="w-44"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-dim">
                Access level
                <Input
                  name="accessLevel"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={mapping?.accessLevel ?? 1}
                  className="w-24"
                />
              </label>
              <input type="hidden" name="sort" value={mapping?.sort ?? 0} />
              <Button type="submit" size="sm" variant="gold">
                Save
              </Button>
            </form>
          </Card>
        ))}
      </div>

      {/* Feature toggles */}
      <Card className="mt-6">
        <Whisper className="mb-3">Features</Whisper>
        <div className="flex flex-wrap gap-3">
          <form action={toggleSetting}>
            <input type="hidden" name="key" value="automations_enabled" />
            <Button type="submit" size="sm" variant={automations ? "gold" : "ghost"}>
              Automations: {automations ? "on" : "off"}
            </Button>
          </form>
          <form action={toggleSetting}>
            <input type="hidden" name="key" value="downloads_enabled" />
            <Button type="submit" size="sm" variant={downloads ? "gold" : "ghost"}>
              Offline downloads: {downloads ? "on" : "off"}
            </Button>
          </form>
        </div>
        <Whisper className="mt-2 text-xs">
          Automations send reclaim nudges to inactive subjects and broken chains
          (respects quiet hours). Off by default.
        </Whisper>
      </Card>

      {/* Auto-welcome DM on first connect (ROADMAP R9.9b) */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Whisper>First-connect welcome</Whisper>
          <form action={toggleSetting}>
            <input type="hidden" name="key" value="welcome_dm_enabled" />
            <Button
              type="submit"
              size="sm"
              variant={welcomeEnabled ? "gold" : "ghost"}
            >
              Welcome DM: {welcomeEnabled ? "on" : "off"}
            </Button>
          </form>
        </div>
        <form action={setWelcomeDmText} className="mt-3">
          <textarea
            name="text"
            defaultValue={welcomeText}
            rows={3}
            maxLength={500}
            className="w-full rounded-[var(--radius)] border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-gold focus:outline-none"
          />
          <div className="mt-2">
            <Button type="submit" size="sm" variant="gold">
              Save welcome
            </Button>
          </div>
        </form>
        <Whisper className="mt-2 text-xs">
          When on, a brand-new subject&apos;s first sign-in lands this as a real
          message in their thread — and pushes &ldquo;She spoke to you.&rdquo; Sent
          once per subject, never to you.
        </Whisper>
      </Card>

      {/* The Oath — the collar (R9.5) */}
      <Card className="mt-6">
        <Whisper className="mb-3">The Oath — the collar</Whisper>
        <form
          action={setOathMinStreak}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Unbroken days to earn the petition
            <Input
              name="minStreak"
              type="number"
              min={1}
              max={3650}
              defaultValue={oathMinStreak}
              className="w-28"
            />
          </label>
          <Button type="submit" size="sm" variant="gold">
            Save
          </Button>
        </form>
        <Whisper className="mt-2 text-xs">
          A subject who holds their chain this many days may petition to be
          collared. You accept or decline from Today or their profile.
        </Whisper>

        <form
          action={setOathGiftTrack}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-3"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Monthly gift for the collared
            <Select
              name="trackId"
              defaultValue={oathGiftTrackId ?? ""}
              className="w-64"
            >
              <option value="">— none —</option>
              {publishedTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm" variant="gold">
            Save gift
          </Button>
        </form>
        <Whisper className="mt-2 text-xs">
          On the 1st of each month this track is granted to every collared subject
          who lacks it, and they&apos;re told a gift waits. Leave as none for no gift.
        </Whisper>
      </Card>

      {/* Content pipeline (ROADMAP C1.3) */}
      <Card className="mt-6">
        <Whisper className="mb-3">Content pipeline</Whisper>
        <div className="flex flex-wrap items-center gap-3">
          <form action={toggleSetting}>
            <input type="hidden" name="key" value="auto_pipeline" />
            <Button
              type="submit"
              size="sm"
              variant={autoPipeline ? "gold" : "ghost"}
            >
              Auto-pipeline: {autoPipeline ? "on" : "off"}
            </Button>
          </form>
          <form action={toggleSetting}>
            <input type="hidden" name="key" value="analysis_enabled" />
            <Button
              type="submit"
              size="sm"
              variant={analysisEnabled ? "gold" : "ghost"}
            >
              Deep analysis: {analysisEnabled ? "on" : "off"}
            </Button>
          </form>
        </div>
        <Whisper className="mt-2 text-xs">
          When on, a new upload transcribes and organizes itself — drop files in
          and walk away. Everything still lands as a draft until you publish.
        </Whisper>

        <div className="mt-4 border-t border-line pt-3">
          <Whisper className="mb-2 text-xs uppercase tracking-wide">
            How much organizing applies on its own
          </Whisper>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["tags_only", "Tags only"],
                ["everything", "Everything"],
                ["review_all", "Review all"],
              ] as const
            ).map(([value, label]) => (
              <form action={setOrganizeAutoApply} key={value}>
                <input type="hidden" name="value" value={value} />
                <Button
                  type="submit"
                  size="sm"
                  variant={autoApply === value ? "gold" : "ghost"}
                >
                  {label}
                </Button>
              </form>
            ))}
          </div>
          <Whisper className="mt-2 text-xs">
            <b>Tags only</b> (recommended): tags and playlist placements apply
            automatically; trigger suggestions wait for your approval.{" "}
            <b>Everything</b>: triggers apply too. <b>Review all</b>: nothing
            applies until you approve it in Organize.
          </Whisper>
        </div>
      </Card>

      {/* Manual add (fallback when tiers weren't auto-discovered). */}
      <Card className="mt-6">
        <Whisper className="mb-3">Add a mapping by hand</Whisper>
        <form
          action={saveTierMapping}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Patreon tier id
            <Input name="patreonTierId" required className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Label
            <Input name="label" required className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-dim">
            Access level
            <Input
              name="accessLevel"
              type="number"
              min={0}
              max={99}
              defaultValue={1}
              className="w-24"
            />
          </label>
          <input type="hidden" name="sort" value={0} />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      </Card>
    </div>
  );
}
