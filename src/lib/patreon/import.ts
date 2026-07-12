import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
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
  hasAudio: boolean;
}

/** A page of posts marked with whether each is already imported. */
export async function listImportablePosts(
  cursor?: string,
): Promise<{
  ready: boolean;
  posts: ImportablePost[];
  nextCursor: string | null;
  error?: string;
}> {
  const token = creatorToken();
  if (!token) return { ready: false, posts: [], nextCursor: null };

  try {
    let cid = await creatorCampaignId();
    if (!cid) {
      // Discover the campaign from the creator token if not stored yet.
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
        nextCursor: null,
        error: "No campaign found for this access token.",
      };
    }

    const { posts, nextCursor } = await fetchCampaignPosts(token, cid, cursor);
    const ids = posts.map((p) => p.postId);
    const existing = ids.length
      ? await db
          .select({ pid: tracks.patreonPostId })
          .from(tracks)
          .where(inArray(tracks.patreonPostId, ids))
      : [];
    const importedSet = new Set(existing.map((e) => e.pid));
    return {
      ready: true,
      nextCursor,
      posts: posts.map((p) => ({
        ...p,
        imported: importedSet.has(p.postId),
        hasAudio: p.audio.length > 0,
      })),
    };
  } catch (err) {
    // Surface the Patreon error on the page instead of crashing it.
    return {
      ready: true,
      posts: [],
      nextCursor: null,
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
  if (!post || post.audio.length === 0) return [];

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
