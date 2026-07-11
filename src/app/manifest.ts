import type { MetadataRoute } from "next";
import { copy } from "@/copy/copy";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: copy.brand.name,
    short_name: copy.brand.name,
    description: copy.brand.tagline,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0a0e",
    theme_color: "#0b0a0e",
    icons: [
      // Placeholder icons; replaced in the design pass (PLAN §11).
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
