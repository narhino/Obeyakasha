import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { copy } from "@/copy/copy";
import { DISGUISE_ICON } from "@/lib/push/disguise";

/**
 * Dynamic PWA manifest (R6 Secret mode). Served at /manifest.webmanifest —
 * the URL the root layout's `metadata.manifest` points at. It replaces the
 * static `app/manifest.ts` convention file precisely so it can vary per
 * session: when the signed-in subject has Secret mode on, a fresh install
 * looks utterly mundane ("Daily" + a neutral grey icon). Already-installed
 * apps keep their old name until reinstalled — the You page says so.
 *
 * Per-request, never cached (the session decides the body).
 */
export const dynamic = "force-dynamic";

const BRAND_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  {
    src: "/icons/icon-maskable.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable" as const,
  },
];

const NEUTRAL_ICONS = [
  { src: DISGUISE_ICON, sizes: "any", type: "image/svg+xml" },
  {
    src: DISGUISE_ICON,
    sizes: "any",
    type: "image/svg+xml",
    purpose: "maskable" as const,
  },
];

function brandManifest() {
  return {
    name: copy.brand.name,
    short_name: copy.brand.name,
    description: copy.brand.tagline,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0812",
    theme_color: "#0b0812",
    icons: BRAND_ICONS,
  };
}

// Deliberately generic identity — see src/lib/push/disguise.ts for why the
// disguise strings bypass the copy.ts voice rule.
function neutralManifest() {
  return {
    name: "Daily",
    short_name: "Daily",
    description: "Reminders and daily notes.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f1f4",
    theme_color: "#8b8b92",
    icons: NEUTRAL_ICONS,
  };
}

export async function GET() {
  const session = await auth();
  let disguised = false;
  if (session?.user) {
    const [row] = await db
      .select({ disguiseMode: users.disguiseMode })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    disguised = Boolean(row?.disguiseMode);
  }

  const manifest = disguised ? neutralManifest() : brandManifest();
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
