import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { PlayerRoot } from "@/components/player/PlayerRoot";
import { PageViews } from "@/components/analytics/PageViews";
import { PageGlow } from "@/components/ui";
import { copy } from "@/copy/copy";

/**
 * Display serif — self-hosted at build by next/font (no runtime requests,
 * CSP-safe). The body face is intentionally the system stack (globals.css).
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const metadata: Metadata = {
  title: copy.brand.name,
  description: copy.brand.tagline,
  applicationName: copy.brand.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: copy.brand.name,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0812",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Session is read here only to tell the audio engine whether to run subject
  // telemetry — a logged-out visitor may still play a free sample (R9.8) — and
  // to keep the goddess's own browsing out of her own traffic numbers (A21).
  const session = await auth();
  const isGoddess = session?.user?.role === "goddess";
  return (
    <html lang="en" className={cormorant.variable}>
      <body className="min-h-dvh text-text antialiased">
        {/* Ambient candlelight behind the whole app — one instance, never
            per-page (D2). Sits at a negative z; content paints above it. */}
        <PageGlow />
        {children}
        {/* The single audio engine + mini-player, mounted once so playback and
            the Spotify-style mini-player persist across every route (including
            the Whispers Home). Inert until a track is playing; hides its own
            chrome on the Sanctum and ritual screens. */}
        <PlayerRoot signedIn={Boolean(session?.user)} />
        {/* First-party page-view beacon (A21). One row per route change in her
            own database — no third party, no IP, no user-agent, Do Not Track
            respected client-side. Her own visits are not counted. */}
        <PageViews enabled={!isGoddess} />
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}
