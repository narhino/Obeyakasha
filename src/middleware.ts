import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Edge middleware uses ONLY the edge-safe config (no DB). The `authorized`
 * callback gates /sanctum and subject routes by session + role.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets, the auth API, and the manifest.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)",
  ],
};

export default middleware;
