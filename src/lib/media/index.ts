import { env } from "@/lib/env";
import { BunnyMediaProvider } from "./bunny";
import { LocalMediaProvider } from "./local";
import type { MediaProvider } from "./provider";

/**
 * Selects the media provider from env: Bunny when a storage zone is configured
 * (prod/staging), otherwise the local filesystem (dev/test). Same interface.
 */
let provider: MediaProvider | null = null;

export function mediaProvider(): MediaProvider {
  if (provider) return provider;
  provider = env.BUNNY_STORAGE_ZONE
    ? new BunnyMediaProvider()
    : new LocalMediaProvider();
  return provider;
}

export type { MediaProvider } from "./provider";
