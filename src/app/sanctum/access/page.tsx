import { db } from "@/lib/db";
import { tierMappings } from "@/lib/db/schema";
import { getRawSetting } from "@/lib/settings";
import type { PatreonTier } from "@/lib/patreon/client";
import { Badge, Button, Card, Display, Input, Whisper } from "@/components/ui";
import { saveTierMapping } from "./actions";

export default async function AccessPage() {
  const [existing, discoveredTiers] = await Promise.all([
    db.select().from(tierMappings),
    getRawSetting<PatreonTier[]>("patreon_campaign_tiers", []),
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
      <Display className="text-3xl">Access</Display>
      <Whisper className="mt-1">
        Map each Patreon tier to an access level. Level 0 is the free Threshold;
        higher levels unlock more of the Library.
      </Whisper>

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
