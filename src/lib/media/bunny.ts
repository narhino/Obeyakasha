import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import type { MediaProvider, ReadResult } from "./provider";

/**
 * Bunny.net storage + CDN provider (prod, PLAN §7). Bunny is content-neutral
 * toward legal material and the cheapest way to stream audio. Streaming uses
 * Bunny CDN Token Authentication so URLs are signed + expiring; readStream is
 * unused in prod because the client fetches the CDN directly.
 *
 * NOTE: exercised in staging/prod (needs a real zone); not covered by local
 * tests. The interface + signing match Bunny's documented token-auth scheme.
 */
export class BunnyMediaProvider implements MediaProvider {
  readonly kind = "bunny" as const;

  private storageBase() {
    return `https://storage.bunnycdn.com/${env.BUNNY_STORAGE_ZONE}`;
  }

  private async put(key: string, bytes: Uint8Array, contentType: string) {
    const res = await fetch(`${this.storageBase()}/${key}`, {
      method: "PUT",
      headers: {
        AccessKey: env.BUNNY_STORAGE_KEY!,
        "Content-Type": contentType,
      },
      body: bytes as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`Bunny PUT ${key} → ${res.status}`);
    }
    return key;
  }

  putOriginal(trackId: string, filename: string, bytes: Uint8Array) {
    return this.put(
      `originals/${trackId}/${filename}`,
      bytes,
      "application/octet-stream",
    );
  }
  putStream(trackId: string, bytes: Uint8Array, ext: string) {
    const contentType =
      ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/mp4";
    return this.put(`stream/${trackId}${ext}`, bytes, contentType);
  }
  putArtwork(trackId: string, bytes: Uint8Array, contentType: string) {
    return this.put(`art/${trackId}.webp`, bytes, contentType);
  }

  /** Bunny CDN Token Authentication (SHA256 of token key + path + expiry). */
  async signStreamUrl(streamKey: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const path = `/${streamKey}`;
    const hashInput = `${env.BUNNY_TOKEN_KEY}${path}${expires}`;
    const token = createHash("sha256")
      .update(hashInput)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    return `https://${env.BUNNY_CDN_HOST}${path}?token=${token}&expires=${expires}`;
  }

  async readStream(): Promise<ReadResult> {
    // Not used in prod — the client fetches the signed CDN URL directly.
    throw new Error("readStream is not supported by the Bunny provider");
  }

  async delete(key: string): Promise<void> {
    await fetch(`${this.storageBase()}/${key}`, {
      method: "DELETE",
      headers: { AccessKey: env.BUNNY_STORAGE_KEY! },
    });
  }
}
