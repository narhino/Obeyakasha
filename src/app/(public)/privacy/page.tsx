import { Display, Whisper } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Display className="text-3xl">Privacy</Display>
      <Whisper className="mt-1">What is kept, and what is never shared.</Whisper>

      <div className="mt-8 space-y-4 text-sm leading-relaxed text-text-dim">
        <p>
          <strong className="text-text">Discretion is the point.</strong> This is
          a private space. Your identity and your kink profile are stored
          separately, and your listening is never sold, shared, or shown to any
          other member. No one but Akasha sees your profile.
        </p>
        <p>
          <strong className="text-text">What is collected.</strong> Your chosen
          name and the answers you give; which files you listen to and how deep
          you drop; messages you send her; and the technical bits needed to run
          the app (your membership status via Patreon, your device for
          notifications). Your email lives only with sign-in, kept apart from
          your profile.
        </p>
        <p>
          <strong className="text-text">No third-party trackers.</strong> There
          are no advertising or analytics trackers. Data stays on Akasha&apos;s
          own server.
        </p>
        <p>
          <strong className="text-text">Notifications.</strong> Push
          notifications are sent only by Akasha, and honor your quiet hours.
        </p>
        <p>
          <strong className="text-text">Your control.</strong> In Settings you
          can export everything held about you as a file, or permanently delete
          your account and all of its data. Deletion is immediate and complete.
        </p>
        <p>
          <strong className="text-text">Payments.</strong> Membership is handled
          by Patreon under their own terms and privacy policy; card details never
          touch this platform.
        </p>
      </div>
    </main>
  );
}
