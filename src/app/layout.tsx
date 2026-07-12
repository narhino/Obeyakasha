import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cormorant.variable}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        {children}
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}
