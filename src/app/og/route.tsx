import { ImageResponse } from "next/og";
import { copy } from "@/copy/copy";

/**
 * The link preview image, drawn rather than stored.
 *
 * Every share of this site — a message, a forum post, a bookmark card — shows
 * whatever this returns, and a link with no image is a link most people don't
 * click. Generating it means it is always exactly 1200×630 (what every platform
 * crops to), always matches the brand tokens, and never becomes a stale asset
 * someone forgot to re-export.
 *
 * Deliberately typographic: no photograph. This is shared into places that
 * preview images automatically, sometimes on someone's work machine, and a
 * wordmark travels where a picture of her would not.
 */
export const runtime = "nodejs";
// Immutable in practice — regenerating per request would be waste.
export const revalidate = 86400;

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // The app's own ink and candlelight (globals.css tokens, inlined
          // because this renders outside the stylesheet).
          background:
            "radial-gradient(120% 120% at 50% 0%, #1a1226 0%, #0b0812 60%, #070510 100%)",
          color: "#efe7dc",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            fontSize: 128,
            letterSpacing: 28,
            color: "#d9b26a",
            display: "flex",
          }}
        >
          AKASHA
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            color: "#b9aec0",
            maxWidth: 900,
            textAlign: "center",
            lineHeight: 1.35,
            display: "flex",
          }}
        >
          Erotic hypnosis audio · guided trance
        </div>
        <div
          style={{
            marginTop: 52,
            fontSize: 22,
            letterSpacing: 6,
            color: "#7d7488",
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {copy.seo.adultNotice}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
