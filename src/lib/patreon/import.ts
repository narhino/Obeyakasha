import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, tracks } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getRawSetting, getSetting, setRawSetting } from "@/lib/settings";
import { ingestUploadFromPath } from "@/lib/media/ingest";
import { enqueue } from "@/lib/jobs/queue";
import { logAudit } from "@/lib/audit";
import {
  fetchCampaignPosts,
  fetchCampaignTiers,
  fetchPost,
  type CampaignPost,
} from "./client";

/**
 * Patreon post importer (ROADMAP-v1.5 Phase I). Reads your own posts via the
 * Creator's Access Token and pulls their audio into the normal pipeline. The
 * original title + description are preserved (nothing lost); descriptions can
 * be rewritten later on the dossier.
 */

export function creatorToken(): string | null {
  return env.PATREON_CREATOR_ACCESS_TOKEN ?? null;
}

export async function creatorCampaignId(): Promise<string | null> {
  return getRawSetting<string | null>("patreon_campaign_id", null);
}

export function importConfigured(token = creatorToken()): boolean {
  return Boolean(token);
}

/** Minimal HTML → text for Patreon post bodies. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ImportablePost extends CampaignPost {
  imported: boolean;
  /** Import-job state for feedback: queued | running | done | failed | null. */
  jobStatus: string | null;
  jobError: string | null;
}

const MAX_PAGES = 15; // ~300 posts — enough for a full catalog

/** Every post across all pages, marked imported / in-progress / failed. */
export async function listImportablePosts(): Promise<{
  ready: boolean;
  posts: ImportablePost[];
  error?: string;
}> {
  const token = creatorToken();
  if (!token) return { ready: false, posts: [] };

  try {
    let cid = await creatorCampaignId();
    if (!cid) {
      const { campaignId } = await fetchCampaignTiers(token);
      if (campaignId) {
        await setRawSetting("patreon_campaign_id", campaignId);
        cid = campaignId;
      }
    }
    if (!cid) {
      return {
        ready: true,
        posts: [],
        error: "No campaign found for this access token.",
      };
    }

    // Walk every page so older years show, not just the latest.
    const all: CampaignPost[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { posts, nextCursor } = await fetchCampaignPosts(token, cid, cursor);
      all.push(...posts);
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    const ids = all.map((p) => p.postId);
    const existing = ids.length
      ? await db
          .select({ pid: tracks.patreonPostId })
          .from(tracks)
          .where(inArray(tracks.patreonPostId, ids))
      : [];
    const importedSet = new Set(existing.map((e) => e.pid));

    // Import-job status per post (for live feedback on the page).
    const jobRows = await db
      .select({
        payload: jobs.payload,
        status: jobs.status,
        lastError: jobs.lastError,
      })
      .from(jobs)
      .where(eq(jobs.kind, "patreon-import"))
      .orderBy(desc(jobs.updatedAt))
      .limit(500);
    const jobByPost = new Map<string, { status: string; error: string | null }>();
    for (const j of jobRows) {
      const pid = (j.payload as { postId?: string } | null)?.postId;
      if (pid && !jobByPost.has(pid)) {
        jobByPost.set(pid, { status: j.status, error: j.lastError ?? null });
      }
    }

    return {
      ready: true,
      posts: all.map((p) => {
        const job = jobByPost.get(p.postId);
        return {
          ...p,
          imported: importedSet.has(p.postId),
          jobStatus: job?.status ?? null,
          jobError: job?.error ?? null,
        };
      }),
    };
  } catch (err) {
    return {
      ready: true,
      posts: [],
      error: err instanceof Error ? err.message : "Patreon request failed",
    };
  }
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`patreon download failed: ${res.status}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest),
  );
}

/**
 * Import one post's audio → draft track(s) + kick off the pipeline. Re-fetches
 * the post so download URLs are fresh (safe to retry). Idempotent: a post whose
 * audio is already imported is skipped.
 */
export async function importPatreonPost(postId: string): Promise<string[]> {
  const token = creatorToken();
  if (!token) throw new Error("Patreon import not configured");

  const [already] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.patreonPostId, postId))
    .limit(1);
  if (already) return [];

  const post = await fetchPost(token, postId);
  // Null = the single-post fetch failed (surface it as a failed job). Empty
  // audio = a text post → skip quietly (job succeeds, no track).
  if (!post) throw new Error("Patreon returned no data for this post");
  if (post.audio.length === 0) return [];

  const description = htmlToText(post.contentHtml) || null;
  const autoPipeline = await getSetting("auto_pipeline");
  const created: string[] = [];

  for (const audio of post.audio) {
    const dir = await mkdtemp(join(tmpdir(), "akasha-patreon-"));
    const tmpPath = join(dir, audio.fileName.replace(/[^\w.\-]+/g, "_"));
    try {
      await downloadTo(audio.downloadUrl, tmpPath);
      const result = await ingestUploadFromPath({
        path: tmpPath,
        filename: audio.fileName,
        title: post.title,
      });
      await db
        .update(tracks)
        .set({
          description,
          source: "patreon_import",
          patreonPostId: post.postId,
          updatedAt: new Date(),
        })
        .where(eq(tracks.id, result.trackId));
      created.push(result.trackId);
      if (autoPipeline) {
        await enqueue(
          "transcribe",
          { trackId: result.trackId },
          { dedupeKey: `transcribe:${result.trackId}` },
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  await logAudit(null, "patreon.imported", {
    postId,
    title: post.title,
    tracks: created.length,
  });
  return created;
}
