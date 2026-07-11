import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import { authConfig } from "@/auth.config";
import { pinGoddessRole, syncPatreonUser } from "@/lib/patreon/sync";
import { logAudit } from "@/lib/audit";

/**
 * Node-runtime auth instance: adapter + Patreon sync events. Server components,
 * route handlers, and server actions import { auth } from here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  events: {
    async signIn({ user, account }) {
      if (!account || account.provider !== "patreon" || !user?.id) return;
      const patreonUserId = account.providerAccountId;
      const accessToken = account.access_token;

      const isGoddess = await pinGoddessRole(
        user.id,
        patreonUserId,
        user.email,
        process.env.ADMIN_PATREON_USER_ID,
        process.env.ADMIN_PATREON_EMAIL,
      );

      if (accessToken) {
        try {
          await syncPatreonUser({ userId: user.id, accessToken, isGoddess });
        } catch (err) {
          // Never block sign-in on a Patreon hiccup (R3). Log and move on.
          await logAudit(user.id, "patreon.sync_failed", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
  },
});
