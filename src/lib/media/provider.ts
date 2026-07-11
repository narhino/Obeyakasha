/**
 * Media provider abstraction (PLAN §7). The app never talks to storage
 * directly — it goes through this interface, so dev/test use the local
 * filesystem and prod uses Bunny with the same call sites.
 *
 * Keys are logical paths (e.g. "stream/<trackId>.m4a"). signStreamUrl returns
 * a URL the CLIENT fetches: for local that's an app route that proxies bytes
 * with Range support; for Bunny that's a token-authenticated CDN URL.
 */

export interface ReadResult {
  body: ReadableStream<Uint8Array> | Uint8Array;
  size: number;
  contentType: string;
  /** For 206 responses: [start, end] inclusive, when a Range was requested. */
  range?: { start: number; end: number };
}

export interface MediaProvider {
  readonly kind: "local" | "bunny";
  putOriginal(trackId: string, filename: string, bytes: Uint8Array): Promise<string>;
  /** ext includes the dot, e.g. ".m4a" / ".mp3"; preserves the real container. */
  putStream(trackId: string, bytes: Uint8Array, ext: string): Promise<string>;
  putArtwork(trackId: string, bytes: Uint8Array, contentType: string): Promise<string>;
  /** Short-lived URL the client can fetch to play the track. */
  signStreamUrl(streamKey: string, ttlSeconds: number): Promise<string>;
  /** Local-only: serve bytes (optionally a Range). Bunny serves via CDN directly. */
  readStream(streamKey: string, range?: string | null): Promise<ReadResult>;
  delete(key: string): Promise<void>;
}
