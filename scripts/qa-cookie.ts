/**
 * QA-only: mint valid Auth.js v5 session cookies for the seeded personas so the
 * browser audit can act as subject/goddess without Patreon OAuth. Uses the
 * library's own encode() with the server's AUTH_SECRET — local testing only.
 * Usage: tsx scripts/qa-cookie.ts <userId> <role>
 */
import { encode } from "next-auth/jwt";

async function main() {
  const [uid, role] = process.argv.slice(2);
  if (!uid || !role) throw new Error("usage: qa-cookie <userId> <subject|goddess>");
  const secret = process.env.AUTH_SECRET!;
  const salt = "authjs.session-token"; // non-https cookie name = salt in v5
  const token = await encode({
    token: { uid, role, sub: uid, name: role === "goddess" ? "Akasha" : "moth" },
    secret,
    salt,
    maxAge: 24 * 60 * 60,
  });
  console.log(`${salt}=${token}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
