import type { NextAuthConfig } from "next-auth";
import Patreon from "next-auth/providers/patreon";

/**
 * Edge-safe auth config: providers + JWT/session shaping + route authorization.
 * NO database imports here — middleware bundles this, and middleware runs on
 * the edge runtime. DB-bound work (adapter, Patreon sync) lives in auth.ts.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  providers: [
    Patreon({
      clientId: process.env.PATREON_CLIENT_ID,
      clientSecret: process.env.PATREON_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "identity identity[email] identity.memberships campaigns",
        },
      },
    }),
  ],
  callbacks: {
    // Route protection (PLAN §6.5). Runs in middleware.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const role = auth?.user?.role;
      const isLoggedIn = Boolean(auth?.user);

      if (pathname.startsWith("/sanctum")) {
        return role === "goddess";
      }
      if (pathname.startsWith("/api/sanctum")) {
        return role === "goddess";
      }
      // Subject area requires a session; public routes handled by matcher.
      // `/` (the Whispers feed) and `/about` stay public — not listed here, so
      // they fall through to the public `return true` below. `/whispers` is a
      // public redirect to `/`, so it is intentionally NOT gated either.
      const subjectPrefixes = [
        "/library",
        "/programs",
        "/inbox",
        "/asks",
        "/orders",
        "/messages",
        "/commissions",
        "/settings",
        "/me",
      ];
      if (subjectPrefixes.some((p) => pathname.startsWith(p))) {
        return isLoggedIn;
      }
      return true;
    },
    jwt({ token, user, account }) {
      // On sign-in the adapter `user` row carries our custom columns.
      if (user) {
        token.uid = user.id as string;
        const role = (user as { role?: string }).role;
        token.role = role === "goddess" ? "goddess" : "subject";
      }
      if (account?.provider === "patreon") {
        token.patreonId = account.providerAccountId;
        // Goddess pin also reflected into the token immediately (DB pin in auth.ts).
        // Match by numeric id OR configured admin email (value Akasha knows).
        const byId =
          !!process.env.ADMIN_PATREON_USER_ID &&
          account.providerAccountId === process.env.ADMIN_PATREON_USER_ID;
        const byEmail =
          !!process.env.ADMIN_PATREON_EMAIL &&
          !!user?.email &&
          user.email.trim().toLowerCase() ===
            process.env.ADMIN_PATREON_EMAIL.trim().toLowerCase();
        if (byId || byEmail) token.role = "goddess";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role =
          (token.role as "subject" | "goddess" | undefined) ?? "subject";
        session.user.patreonId = token.patreonId as string | undefined;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
