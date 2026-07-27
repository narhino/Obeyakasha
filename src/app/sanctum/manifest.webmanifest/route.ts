/**
 * The Sanctum's own PWA manifest. Installing while on /sanctum installs HER
 * app — it opens straight into the Sanctum instead of the subject Home, and
 * lives on her home screen beside (not instead of) the subject app.
 *
 * Deliberately a SEPARATE route from /manifest.webmanifest rather than a
 * role-branch inside it: a manifest is fetched without credentials by default,
 * so a role-dependent body at one URL is unreliable. Two URLs, two identities,
 * no session needed — and the subject manifest (including its Secret-mode
 * neutral identity) is left exactly as it was.
 *
 * Static content: this reveals nothing beyond the existence of an admin area,
 * which /sanctum already does by redirecting to sign-in.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Sanctum",
      short_name: "Sanctum",
      description: "The room behind the door.",
      // Opens and stays inside the Sanctum — a tap on the icon lands on Today.
      start_url: "/sanctum",
      scope: "/sanctum",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0b0812",
      theme_color: "#0b0812",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/icons/icon-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
