import { Display, Whisper } from "@/components/ui";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Display className="text-3xl">Terms</Display>
      <Whisper className="mt-1">The plain truth of what this is.</Whisper>

      <div className="mt-8 space-y-4 text-sm leading-relaxed text-text-dim">
        <p>
          <strong className="text-text">For adults only.</strong> You confirm you
          are eighteen or older. This platform contains erotic hypnosis audio
          intended for adults.
        </p>
        <p>
          <strong className="text-text">A practice, not treatment.</strong> The
          recordings here are for relaxation, entertainment, and adult play. They
          are not medical care, psychotherapy, or a substitute for professional
          help. Nothing here diagnoses or treats any condition. If you are
          dealing with a medical or mental-health issue, speak to a qualified
          professional.
        </p>
        <p>
          <strong className="text-text">Never while driving.</strong> Do not
          listen to trance recordings while driving, operating machinery, or
          doing anything that requires your attention. Listen somewhere safe
          where you can rest.
        </p>
        <p>
          <strong className="text-text">Consent is yours.</strong> You choose to
          listen and you may stop at any time. A grounding control is always
          available to bring you back.
        </p>
        <p>
          <strong className="text-text">Membership &amp; access.</strong> Access
          follows your active membership. Content is licensed to you for personal
          use only — you may not copy, share, or redistribute it.
        </p>
        <p>
          <strong className="text-text">Your data.</strong> See the{" "}
          <a href="/privacy" className="text-gold underline">
            privacy page
          </a>
          . You can export or delete your data at any time in Settings.
        </p>
      </div>
    </main>
  );
}
