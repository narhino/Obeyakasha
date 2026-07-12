import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "pg"],
  experimental: {
    // Audio uploads via server actions (PLAN §7.2). Chunked/tus upload for very
    // large masters is a later hardening; this covers typical file sizes.
    serverActions: { bodySizeLimit: "512mb" },
  },
  async headers() {
    // App-safe CSP (PLAN §20). script/style keep 'unsafe-inline' because the
    // App Router injects inline bootstrap without a nonce; tightening to nonces
    // is a later hardening. Media/img/connect allow https: + blob: so Bunny CDN
    // streams, artwork, and decrypted offline blobs work.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" +
        (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
