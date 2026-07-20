import { redirect } from "next/navigation";

/**
 * Settings is gone (F5). Everything it held now lives on the Mirror (`/me`) —
 * the quiet controls under "Your terms", the rest woven into the page. This
 * permanent redirect keeps any old links and push deep-links alive.
 */
export default function SettingsRedirect() {
  redirect("/me");
}
