/**
 * Entitlement resolution — PURE functions, exhaustively unit-tested (PLAN §6.2).
 * No DB, no I/O. The DB-backed resolver in ./resolve.ts feeds these.
 *
 * effective_access(user) =
 *   max( levels from active|grace Patreon tiers,
 *        levels from active 'grant' entitlements,
 *        0 )
 * A 'frozen' entitlement contributes nothing (access seals) but progress is
 * preserved elsewhere. Unmapped Patreon tiers resolve to level 1 (+ warn).
 */

export const THRESHOLD_LEVEL = 0;
export const DEFAULT_MAPPED_LEVEL = 1;

export type EntitlementStatus = "active" | "grace" | "frozen";

export interface TierMapping {
  patreonTierId: string;
  accessLevel: number;
}

export interface PatreonState {
  /** currently-entitled Patreon tier ids for this user */
  entitledTierIds: string[];
  /** lifecycle status of the Patreon entitlement */
  status: EntitlementStatus;
}

export interface GrantEntitlement {
  accessLevel: number;
  status: EntitlementStatus;
}

export interface EntitlementInputs {
  patreon?: PatreonState;
  grants?: GrantEntitlement[];
  mappings: TierMapping[];
}

export interface EntitlementResult {
  /** highest access level the user may reach right now */
  accessLevel: number;
  /** true when the Patreon side is in grace (full access, gentle warning) */
  inGrace: boolean;
  /** true when the Patreon side is frozen (access sealed, progress preserved) */
  frozen: boolean;
  /** Patreon tier ids with no mapping row — Sanctum should warn */
  unmappedTierIds: string[];
}

/** Level a set of Patreon tier ids resolves to, via mappings (unmapped → default). */
function patreonLevel(
  entitledTierIds: string[],
  mappings: TierMapping[],
): { level: number; unmapped: string[] } {
  const byId = new Map(mappings.map((m) => [m.patreonTierId, m.accessLevel]));
  let level = THRESHOLD_LEVEL;
  const unmapped: string[] = [];
  for (const tierId of entitledTierIds) {
    const mapped = byId.get(tierId);
    if (mapped === undefined) {
      unmapped.push(tierId);
      level = Math.max(level, DEFAULT_MAPPED_LEVEL);
    } else {
      level = Math.max(level, mapped);
    }
  }
  return { level, unmapped };
}

export function effectiveAccess(inputs: EntitlementInputs): EntitlementResult {
  const { patreon, grants = [], mappings } = inputs;

  let level = THRESHOLD_LEVEL;
  let inGrace = false;
  let frozen = false;
  let unmappedTierIds: string[] = [];

  if (patreon && patreon.entitledTierIds.length > 0) {
    if (patreon.status === "frozen") {
      // Frozen Patreon contributes no access.
      frozen = true;
    } else {
      const { level: pLevel, unmapped } = patreonLevel(
        patreon.entitledTierIds,
        mappings,
      );
      level = Math.max(level, pLevel);
      unmappedTierIds = unmapped;
      if (patreon.status === "grace") inGrace = true;
    }
  } else if (patreon && patreon.status === "frozen") {
    frozen = true;
  }

  // Grants stack independently; frozen grants contribute nothing.
  for (const g of grants) {
    if (g.status === "frozen") continue;
    level = Math.max(level, g.accessLevel);
  }

  return { accessLevel: level, inGrace, frozen, unmappedTierIds };
}

/** Can a subject at `access` see a track/program requiring `minLevel`? */
export function canAccess(access: number, minLevel: number): boolean {
  return access >= minLevel;
}
