import type { Metadata, Viewport } from "next";
import "./globals.css";
import { copy } from "@/copy/copy";

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
  themeColor: "#0b0a0e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
