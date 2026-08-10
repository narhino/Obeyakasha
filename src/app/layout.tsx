import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { PlayerRoot } from "@/components/player/PlayerRoot";
import { PageViews } from "@/components/analytics/PageViews";
import { PageGlow } from "@/components/ui";
import { copy } from "@/copy/copy";
import { SITE_ORIGIN } from "@/lib/seo/site";

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

/**
 * SEO NOTE — this used to carry `robots: { index: false, follow: false }`,
 * which told every crawler to ignore the entire site. That is right for a
 * members' app and wrong for the public half of this one: the landing page, the
 * catalogue and a page per recorded file are all readable by a stranger and are
 * the only way anyone finds her without going through Patreon first.
 *
 * The blanket rule is gone. In its place: indexable by default, with every
 * private area noindexed in its OWN layout (`PRIVATE_META`) and disallowed in
 * robots.txt. Two independent locks — a mistake in one must not be enough to
 * publish a member's page.
 *
 * `metadataBase` is what makes every relative image, canonical and preview URL
 * resolve to an absolute one; without it Next emits relative URLs that no
 * crawler or link unfurler can follow.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: copy.seo.homeTitle,
    // Every page supplies its own short title; this appends the site name once,
    // so a result reads "The Library · Obey Akasha" instead of repeating her
    // name inside each page's own title.
    template: copy.seo.titleTemplate,
  },
  description: copy.seo.homeDescription,
  applicationName: copy.brand.name,
  authors: [{ name: copy.brand.name, url: SITE_ORIGIN }],
  creator: copy.brand.name,
  publisher: copy.brand.name,
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
  // Stated honestly. This is adult work: labelling it is what keeps it out of
  // results meant for children and IN the results of people looking for it,
  // and search engines penalise adult content that hides what it is.
  other: {
    rating: "adult",
    "RATING": "RTA-5042-1996-1400-1577-RTA",
  },
  // Default posture is now indexable; a private route overrides it locally.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
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
