import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Edge middleware uses ONLY the edge-safe config (no DB). The `authorized`
 * callback gates /sanctum and subject routes by session + role.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets, the auth API, and the manifest.
  //
  // `api/pulse` is excluded deliberately: it is polled every few seconds by
  // every open tab and gates nothing by pathname — it reads its own session and
  // decides what to answer. Running edge auth on it would add a check per poll
  // for no protection at all.
  matcher: [
    "/((?!api/auth|api/health|api/pulse|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js).*)",
  ],
};

export default middleware;
