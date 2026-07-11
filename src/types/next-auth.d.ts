import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "subject" | "goddess";
      patreonId?: string;
    } & DefaultSession["user"];
  }

  // Adapter user carries our extended columns at runtime.
  interface User {
    role?: "subject" | "goddess";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: "subject" | "goddess";
    patreonId?: string;
  }
}
