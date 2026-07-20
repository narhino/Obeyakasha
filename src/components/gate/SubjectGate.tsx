"use client";

import { useEffect, useRef, useState } from "react";
import {
  detectPlatform,
  fetchVapidKey,
  getDeviceId,
  iosVersion,
  isStandalone,
  recordConsent,
  registerDevice,
  registerServiceWorker,
  subscribeToPush,
  type Platform,
} from "@/lib/pwa/client";
import { Button, Display, Whisper } from "@/components/ui";
import { Switch } from "@/components/me/Switch";
import { NotificationPreview } from "@/components/me/NotificationPreview";
import { setDisguiseMode } from "@/lib/profile/secret";
import { DISGUISE_MESSAGES } from "@/lib/push/disguise";
import { copy } from "@/copy/copy";

/**
 * The Gate (PLAN §11, F8, A19). Guards the subject area: age + hypnosis-terms
 * consent, then install (mobile) and notifications. Install/permission steps
 * are guided but soft (browsers can't reliably confirm "added to home screen"
 * from the tab; forcing it would lock people out) — see docs/DECISIONS.log.md.
 */
type Step = "age" | "terms" | "install" | "notifications" | "done";

interface Ctx {
  platform: Platform;
  standalone: boolean;
  iosVer: number | null;
  vapid: string | null;
  deviceId: string;
}

export function SubjectGate({
  alreadyConsented,
  jailActive = false,
  children,
}: {
  alreadyConsented: boolean;
  /**
   * F4: when the threshold ("notification jail") is on, its takeover owns the
   * MOBILE install + notifications steps (hard, live, persistent). So the Gate
   * hands those off on mobile and does consent only — leaving DESKTOP onboarding
   * and the consent flow exactly as they were. Defaults false (old behaviour).
   */
  jailActive?: boolean;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [satisfied, setSatisfied] = useState(false);
  const [step, setStep] = useState<Step>("age");
  const [consented, setConsented] = useState(alreadyConsented);
  const [notifDenied, setNotifDenied] = useState(false);
  // R6: the disguise choice, offered up front before push is enabled. Default
  // off; persisted to users.disguiseMode via the same action the You page uses.
  const [disguise, setDisguise] = useState(false);
  const ctxRef = useRef<Ctx | null>(null);
  const androidPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      androidPrompt.current = e as unknown as { prompt: () => Promise<void> };
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await registerServiceWorker();
      const platform = detectPlatform();
      const standalone = isStandalone();
      const iosVer = iosVersion();
      const vapid = await fetchVapidKey();
      const deviceId = getDeviceId();
      const perm =
        "Notification" in window ? Notification.permission : "denied";
      await registerDevice({
        deviceId,
        platform,
        installed: standalone,
        pushEnabled: perm === "granted",
        pushSubscription: null,
      });
      if (cancelled) return;
      const ctx: Ctx = { platform, standalone, iosVer, vapid, deviceId };
      ctxRef.current = ctx;
      advance(consented, ctx, perm === "granted");
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function installNeeded(ctx: Ctx) {
    return (ctx.platform === "ios" || ctx.platform === "android") && !ctx.standalone;
  }
  function pushNeeded(ctx: Ctx, granted: boolean) {
    if (!ctx.vapid) return false; // push not configured yet
    if (ctx.platform === "ios" && (ctx.iosVer === null || ctx.iosVer < 16.4))
      return false; // unsupported on old iOS
    return !granted;
  }

  function advance(consentedNow: boolean, ctx: Ctx, granted: boolean) {
    if (!consentedNow) return setStep("age");
    // On mobile with the threshold on, the Jail owns install + notifications;
    // the Gate stops at consent and hands off. Desktop keeps both steps.
    const mobileToJail =
      jailActive && (ctx.platform === "ios" || ctx.platform === "android");
    if (!mobileToJail) {
      if (installNeeded(ctx)) return setStep("install");
      if (pushNeeded(ctx, granted)) return setStep("notifications");
    }
    setStep("done");
    setSatisfied(true);
  }

  async function confirmAge() {
    await recordConsent("age", { at: new Date().toISOString() });
    setStep("terms");
  }
  async function confirmTerms() {
    await recordConsent("hypnosis_terms", { at: new Date().toISOString() });
    setConsented(true);
    if (ctxRef.current) advance(true, ctxRef.current, false);
  }
  async function doAndroidInstall() {
    if (androidPrompt.current) {
      try {
        await androidPrompt.current.prompt();
      } catch {
        /* ignore */
      }
    }
    proceedPastInstall();
  }
  function proceedPastInstall() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void registerDevice({
      deviceId: ctx.deviceId,
      platform: ctx.platform,
      installed: true,
      pushEnabled: false,
      pushSubscription: null,
    });
    if (pushNeeded(ctx, false)) setStep("notifications");
    else {
      setStep("done");
      setSatisfied(true);
    }
  }
  async function enableNotifications() {
    const ctx = ctxRef.current;
    if (!ctx || !ctx.vapid) return;
    const sub = await subscribeToPush(ctx.vapid);
    if (!sub) {
      setNotifDenied(true);
      return;
    }
    await registerDevice({
      deviceId: ctx.deviceId,
      platform: ctx.platform,
      installed: ctx.standalone || ctx.platform === "desktop",
      pushEnabled: true,
      pushSubscription: sub,
    });
    setStep("done");
    setSatisfied(true);
  }
  function chooseDisguise(next: boolean) {
    setDisguise(next); // optimistic; persist via the shared server action
    void setDisguiseMode(next).catch(() => {});
  }

  if (satisfied) return <>{children}</>;
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Whisper>{copy.system.genericHold}</Whisper>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="breathe pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 45%, var(--color-accent-soft) 0%, transparent 72%)",
        }}
      />
      <p className="mb-7 font-[family-name:var(--font-display)] text-5xl text-gold [text-shadow:0_0_50px_rgba(212,175,106,0.3)]">
        {copy.brand.mark}
      </p>

      {step === "age" && (
        <Panel title={copy.gate.ageTitle} body={copy.gate.ageBody}>
          <Button variant="gold" size="lg" onClick={confirmAge}>
            {copy.gate.ageConfirm}
          </Button>
        </Panel>
      )}

      {step === "terms" && (
        <Panel title={copy.gate.termsTitle} body={copy.gate.termsBody}>
          <Button variant="gold" size="lg" onClick={confirmTerms}>
            {copy.gate.termsConfirm}
          </Button>
        </Panel>
      )}

      {step === "install" && ctxRef.current?.platform === "ios" && (
        <Panel title={copy.gate.installIosTitle} body={copy.gate.installIosBody}>
          {ctxRef.current.iosVer !== null && ctxRef.current.iosVer < 16.4 ? (
            <Whisper className="mt-2">{copy.gate.iosOld}</Whisper>
          ) : null}
          <Button variant="ghost" size="md" onClick={proceedPastInstall}>
            {copy.gate.installedContinue}
          </Button>
        </Panel>
      )}

      {step === "install" && ctxRef.current?.platform === "android" && (
        <Panel title={copy.gate.installAndroidTitle} body={copy.gate.installAndroidBody}>
          <Button variant="gold" size="lg" onClick={doAndroidInstall}>
            {copy.gate.installButton}
          </Button>
        </Panel>
      )}

      {step === "notifications" && (
        <Panel title={copy.gate.notifTitle} body={copy.gate.notifBody}>
          {/* Disguise choice, up front, before push is enabled. */}
          <div className="w-full rounded-[var(--radius-lg)] border border-line/80 bg-surface/60 p-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label-caps text-gold">{copy.gate.discreetTitle}</p>
                <Whisper className="mt-1 text-xs">{copy.gate.discreetBody}</Whisper>
              </div>
              <Switch
                checked={disguise}
                onChange={chooseDisguise}
                label={copy.gate.discreetToggle}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <NotificationPreview
                variant="true"
                label={copy.secret.previewTrueLabel}
                title={copy.secret.previewTrueTitle}
                body={copy.secret.previewTrueBody}
              />
              <NotificationPreview
                variant="mask"
                label={copy.secret.previewMaskLabel}
                title={DISGUISE_MESSAGES[0]!.title}
                body={DISGUISE_MESSAGES[0]!.body}
              />
            </div>
          </div>

          <Button variant="gold" size="lg" onClick={enableNotifications}>
            {copy.gate.notifButton}
          </Button>
          {notifDenied ? (
            <Whisper className="mt-3">{copy.gate.notifDenied}</Whisper>
          ) : null}
        </Panel>
      )}
    </div>
  );
}

function Panel({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-sm">
      <Display className="text-[1.75rem]">{title}</Display>
      <div className="ornament mx-auto mt-4 w-28" aria-hidden>
        <span className="font-[family-name:var(--font-display)] text-xs leading-none">
          ✦
        </span>
      </div>
      <Whisper className="mt-4 text-base leading-relaxed">{body}</Whisper>
      <div className="mt-9 flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}
