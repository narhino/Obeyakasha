import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { creatorCampaignId, creatorToken } from "./import";

/**
 * Import diagnostic (ROADMAP-v1.5). Shows the EXACT Patreon responses + worker
 * job state so we can tell whether the API is handing us audio at all, rather
 * than guessing. Goddess-only surface.
 */
const API = "https://www.patreon.com/api/oauth2/v2";

export interface DiagnoseResult {
  configured: boolean;
  campaignId: string | null;
  jobs: { queued: number; running: number; done: number; failed: number };
  recentErrors: string[];
  listStatus?: number;
  samplePostId?: string | null;
  samplePostTitle?: string | null;
  postStatus?: number;
  includedTypes?: string[];
  parsedAudioCount?: number;
  postRaw?: string;
  note?: string;
}

export async function diagnoseImport(): Promise<DiagnoseResult> {
  const token = creatorToken();
  const cid = await creatorCampaignId();

  // Worker/job state for patreon-import.
  const rows = await db
    .select({ status: jobs.status, lastError: jobs.lastError })
    .from(jobs)
    .where(eq(jobs.kind, "patreon-import"))
    .orderBy(desc(jobs.updatedAt))
    .limit(500);
  const counts = { queued: 0, running: 0, done: 0, failed: 0 };
  const recentErrors: string[] = [];
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts]++;
    if (r.lastError && recentErrors.length < 5) recentErrors.push(r.lastError);
  }

  if (!token || !cid) {
    return {
      configured: false,
      campaignId: cid,
      jobs: counts,
      recentErrors,
      note: !token
        ? "No PATREON_CREATOR_ACCESS_TOKEN set."
        : "No campaign id discovered yet.",
    };
  }

  const headers = { Authorization: `Bearer ${token}` };

  // 1) Newest post id from the list.
  let samplePostId: string | null = null;
  let samplePostTitle: string | null = null;
  let listStatus: number | undefined;
  try {
    const listUrl =
      `${API}/campaigns/${cid}/posts?` +
      "fields%5Bpost%5D=title,published_at&page%5Bcount%5D=3&sort=-published_at";
    const res = await fetch(listUrl, { headers, cache: "no-store" });
    listStatus = res.status;
    const j = (await res.json()) as {
      data?: { id: string; attributes?: { title?: string } }[];
    };
    samplePostId = j.data?.[0]?.id ?? null;
    samplePostTitle = j.data?.[0]?.attributes?.title ?? null;
  } catch (err) {
    return {
      configured: true,
      campaignId: cid,
      jobs: counts,
      recentErrors,
      listStatus,
      note: `List fetch threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!samplePostId) {
    return {
      configured: true,
      campaignId: cid,
      jobs: counts,
      recentErrors,
      listStatus,
      note: "List returned no posts to sample.",
    };
  }

  // 2) The single post WITH media — the real test.
  const postUrl =
    `${API}/posts/${samplePostId}?include=attachments_media` +
    "&fields%5Bpost%5D=title" +
    "&fields%5Bmedia%5D=download_url,file_name,mimetype,size_bytes";
  const res = await fetch(postUrl, { headers, cache: "no-store" });
  const postStatus = res.status;
  const raw = await res.text();

  let includedTypes: string[] = [];
  let parsedAudioCount = 0;
  try {
    const j = JSON.parse(raw) as {
      included?: { type: string; attributes?: { download_url?: string } }[];
    };
    includedTypes = [...new Set((j.included ?? []).map((r) => r.type))];
    parsedAudioCount = (j.included ?? []).filter(
      (r) => r.type === "media" && r.attributes?.download_url,
    ).length;
  } catch {
    /* raw shown below */
  }

  return {
    configured: true,
    campaignId: cid,
    jobs: counts,
    recentErrors,
    listStatus,
    samplePostId,
    samplePostTitle,
    postStatus,
    includedTypes,
    parsedAudioCount,
    postRaw: raw.slice(0, 6000),
  };
}
