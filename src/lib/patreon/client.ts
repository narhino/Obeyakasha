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

export interface PatreonAudio {
  downloadUrl: string;
  fileName: string;
  mime: string | null;
  bytes: number | null;
}

export interface CampaignPost {
  postId: string;
  title: string;
  contentHtml: string;
  url: string | null;
  publishedAt: string | null;
  isPublic: boolean;
  audio: PatreonAudio[];
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

const POST_QUERY_FIELDS =
  "&fields%5Bpost%5D=title,content,url,published_at,is_public" +
  "&fields%5Bmedia%5D=download_url,file_name,mimetype,size_bytes";

function parsePost(
  p: JsonApiResource,
  media: Map<string, JsonApiResource>,
): CampaignPost {
  const audio: PatreonAudio[] = asArray(
    p.relationships?.attachments_media?.data,
  )
    .map((ref) => media.get(ref.id))
    .filter((m): m is JsonApiResource => Boolean(m))
    .map((m) => ({
      downloadUrl: (m.attributes?.download_url as string | undefined) ?? "",
      fileName: (m.attributes?.file_name as string | undefined) ?? "audio",
      mime:
        (m.attributes?.mimetype as string | undefined) ??
        (m.attributes?.mime_type as string | undefined) ??
        null,
      bytes: (m.attributes?.size_bytes as number | undefined) ?? null,
    }))
    .filter(
      (a) =>
        a.downloadUrl &&
        /audio|\.(mp3|m4a|wav|aac|ogg)/i.test(`${a.mime ?? ""} ${a.fileName}`),
    );
  return {
    postId: p.id,
    title: (p.attributes?.title as string | undefined) ?? "(untitled)",
    contentHtml: (p.attributes?.content as string | undefined) ?? "",
    url: (p.attributes?.url as string | undefined) ?? null,
    publishedAt: (p.attributes?.published_at as string | undefined) ?? null,
    isPublic: Boolean(p.attributes?.is_public),
    audio,
  };
}

function mediaMap(doc: JsonApiDoc): Map<string, JsonApiResource> {
  return new Map(
    (doc.included ?? [])
      .filter((r) => r.type === "media")
      .map((m) => [m.id, m] as const),
  );
}

/**
 * The creator's own posts with any audio attachments (ROADMAP Phase I). Cursor-
 * paginated; call with the returned nextCursor until it's null. Uses the
 * long-lived Creator's Access Token. Tolerant JSON:API parsing like the rest.
 */
export async function fetchCampaignPosts(
  accessToken: string,
  campaignId: string,
  cursor?: string,
): Promise<{ posts: CampaignPost[]; nextCursor: string | null }> {
  // NOTE: the campaign posts-LIST endpoint does NOT accept
  // include=attachments_media (400 ParameterInvalidOnType). Media is resolved
  // per-post via fetchPost() at import time instead.
  const query =
    `/campaigns/${campaignId}/posts?` +
    "fields%5Bpost%5D=title,content,url,published_at,is_public" +
    "&page%5Bcount%5D=20&sort=-published_at" +
    (cursor ? `&page%5Bcursor%5D=${encodeURIComponent(cursor)}` : "");
  const doc = await patreonGet(query, accessToken);
  const media = mediaMap(doc);
  const rows = Array.isArray(doc.data) ? doc.data : [doc.data];
  const posts = rows.map((p) => parsePost(p, media));

  // Cursor may live in meta.pagination.cursors.next OR be embedded in links.next.
  const d = doc as {
    meta?: { pagination?: { cursors?: { next?: string | null } } };
    links?: { next?: string | null };
  };
  let nextCursor = d.meta?.pagination?.cursors?.next ?? null;
  if (!nextCursor && d.links?.next) {
    try {
      nextCursor =
        new URL(d.links.next).searchParams.get("page[cursor]") ?? null;
    } catch {
      nextCursor = null;
    }
  }
  return { posts, nextCursor };
}

/** One post by id, with fresh (short-lived) audio download URLs. */
export async function fetchPost(
  accessToken: string,
  postId: string,
): Promise<CampaignPost | null> {
  const doc = await patreonGet(
    `/posts/${postId}?include=attachments_media${POST_QUERY_FIELDS}`,
    accessToken,
  ).catch(() => null);
  if (!doc) return null;
  const resource = Array.isArray(doc.data) ? doc.data[0] : doc.data;
  if (!resource) return null;
  return parsePost(resource, mediaMap(doc));
}

export interface CampaignMemberRow {
  /** The patron's Patreon user id — what `patreon_links` is keyed on. */
  patreonUserId: string;
  patronStatus: PatronStatus;
  entitledTierIds: string[];
}

/**
 * Every member of the campaign, from HER creator token — one sweep that sees
 * everybody at once.
 *
 * This exists because entitlements previously refreshed only inside a subject's
 * own sign-in. Someone who re-pledged on Patreon stayed frozen in here until
 * they happened to sign fully out and back in, which nobody does — so paying
 * members sat locked out of what they had just paid for.
 *
 * Reading the campaign roster instead of each subject's token means it works
 * for people who never come back to the app at all, and needs no per-user token
 * refresh dance.
 *
 * Paginated with Patreon's cursor. `maxPages` is a hard stop so a malformed
 * cursor can never spin forever against their API.
 */
export async function fetchCampaignMembers(
  campaignId: string,
  accessToken: string,
  maxPages = 50,
): Promise<CampaignMemberRow[]> {
  const out: CampaignMemberRow[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const query =
      `/campaigns/${encodeURIComponent(campaignId)}/members` +
      "?include=currently_entitled_tiers,user" +
      "&fields%5Bmember%5D=patron_status" +
      "&page%5Bcount%5D=200" +
      (cursor ? `&page%5Bcursor%5D=${encodeURIComponent(cursor)}` : "");

    const doc: JsonApiDoc & { meta?: Record<string, unknown> } =
      (await patreonGet(query, accessToken)) as JsonApiDoc & {
        meta?: Record<string, unknown>;
      };

    for (const m of asArray(doc.data)) {
      const userRef = m.relationships?.user?.data;
      const patreonUserId = Array.isArray(userRef) ? userRef[0]?.id : userRef?.id;
      if (!patreonUserId) continue;
      out.push({
        patreonUserId,
        patronStatus:
          (m.attributes?.patron_status as PatronStatus | undefined) ?? null,
        entitledTierIds: asArray(
          m.relationships?.currently_entitled_tiers?.data,
        ).map((t) => t.id),
      });
    }

    const pagination = doc.meta?.pagination as
      | { cursors?: { next?: string | null } }
      | undefined;
    const next = pagination?.cursors?.next ?? null;
    if (!next) break;
    cursor = next;
  }

  return out;
}
