"use client";

import { usePlayer } from "@/lib/player/store";
import { Cover } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";

/**
 * The file page's hero artwork (D5) — presentation only. The D2 gold breath
 * lights the cover ONLY while THIS track is the one actually playing (read from
 * the player store), or when it is premiere-sealed (a glowing promise). It never
 * touches playback; it just reflects it. Steady under reduced-motion (global).
 */
export function FileArtwork({
  trackId,
  cover,
  premiereSealed = false,
}: {
  trackId: string;
  cover: string;
  premiereSealed?: boolean;
}) {
  const current = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const isThisPlaying = playing && current?.id === trackId;

  return (
    <Cover
      src={cover}
      breathing={premiereSealed || isThisPlaying}
      className="aspect-square"
      overlay={
        premiereSealed ? (
          <span
            aria-hidden
            className="glow-gold absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-gold/50 bg-bg/70 text-gold backdrop-blur-sm"
          >
            <IconSpark size={20} />
          </span>
        ) : null
      }
    />
  );
}
