/**
 * Patreon API v2 client (PLAN §6.3). Thin fetch helpers + tolerant parsing.
 * We only ever request the scopes we need: identity, email, memberships.
 */

const API = "https://www.patreon.com/api/oauth2/v2";

export type PatronStatus =
  | "active_patron"
  | "declined_patron"
  | "former_patron"
  | null;

export interface CampaignMembership {
  campaignId: string | null;
  patronStatus: PatronStatus;
  entitledTierIds: string[];
}

export interface PatreonIdentity {
  patreonUserId: string;
  email: string | null;
  fullName: string | null;
  imageUrl: string | null;
  memberships: CampaignMembership[];
}

export interface PatreonTier {
  id: string;
  title: string;
  amountCents: number;
  patronCount: number | null;
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: { id: string; type: string } | { id: string; type: string }[] }
  >;
}

interface JsonApiDoc {
  data: JsonApiResource | JsonApiResource[];
  included?: JsonApiResource[];
}

async function patreonGet(
  path: string,
  accessToken: string,
): Promise<JsonApiDoc> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Patreon data changes rarely within a request; never cache tokens.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Patreon ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as JsonApiDoc;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * The signed-in user's identity + their memberships (which campaigns they
 * patronize and at what tier). Used at sign-in for every subject.
 */
export async function fetchIdentity(
  accessToken: string,
): Promise<PatreonIdentity> {
  const query =
    "/identity?include=memberships,memberships.currently_entitled_tiers,memberships.campaign" +
    "&fields%5Bmember%5D=patron_status" +
    "&fields%5Buser%5D=email,full_name,image_url";
  const doc = await patreonGet(query, accessToken);
  const user = Array.isArray(doc.data) ? doc.data[0]! : doc.data;
  const included = doc.included ?? [];

  const memberResources = asArray(user.relationships?.memberships?.data)
    .map((ref) =>
      included.find((r) => r.type === "member" && r.id === ref.id),
    )
    .filter((r): r is JsonApiResource => Boolean(r));

  const memberships: CampaignMembership[] = memberResources.map((m) => {
    const campaignRef = m.relationships?.campaign?.data;
    const campaignId = Array.isArray(campaignRef)
      ? (campaignRef[0]?.id ?? null)
      : (campaignRef?.id ?? null);
    const entitledTierIds = asArray(
      m.relationships?.currently_entitled_tiers?.data,
    ).map((t) => t.id);
    return {
      campaignId,
      patronStatus: (m.attributes?.patron_status ?? null) as PatronStatus,
      entitledTierIds,
    };
  });

  return {
    patreonUserId: user.id,
    email: (user.attributes?.email as string | undefined) ?? null,
    fullName: (user.attributes?.full_name as string | undefined) ?? null,
    imageUrl: (user.attributes?.image_url as string | undefined) ?? null,
    memberships,
  };
}

/**
 * The creator's own campaign(s) and their tiers. Called when the goddess signs
 * in so the Sanctum tier-mapping UI can list real tiers to map.
 */
export async function fetchCampaignTiers(
  accessToken: string,
): Promise<{ campaignId: string | null; tiers: PatreonTier[] }> {
  const query =
    "/campaigns?include=tiers" +
    "&fields%5Btier%5D=title,amount_cents,patron_count";
  const doc = await patreonGet(query, accessToken);
  const campaigns = Array.isArray(doc.data) ? doc.data : [doc.data];
  const campaignId = campaigns[0]?.id ?? null;
  const included = doc.included ?? [];
  const tiers: PatreonTier[] = included
    .filter((r) => r.type === "tier")
    .map((t) => ({
      id: t.id,
      title: (t.attributes?.title as string | undefined) ?? "Untitled tier",
      amountCents: (t.attributes?.amount_cents as number | undefined) ?? 0,
      patronCount: (t.attributes?.patron_count as number | undefined) ?? null,
    }))
    .sort((a, b) => a.amountCents - b.amountCents);
  return { campaignId, tiers };
}
