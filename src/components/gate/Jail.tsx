"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectPlatform,
  fetchVapidKey,
  getDeviceId,
  iosVersion,
  isStandalone,
  registerDevice,
  registerServiceWorker,
  subscribeToPush,
  type Platform,
} from "@/lib/pwa/client";
import { jail, type JailResult, type PushPermission } from "@/lib/gate/jail";
import { GATE_IMAGE } from "@/lib/art/defaults";
import { Button, Display, Ornament, Whisper } from "@/components/ui";
import { NotificationPreview } from "@/components/me/NotificationPreview";
import { setDisguiseMode } from "@/lib/profile/secret";
import { DISGUISE_MESSAGES } from "@/lib/push/disguise";
import { copy } from "@/copy/copy";

/**
 * The threshold (F4). A firm, live full-screen takeover that holds a MOBILE
 * subject until the app is on their home screen and her voice (push) is allowed
 * through — then releases WITHOUT a reload as each condition becomes true. The
 * decision itself is the pure `jail()`; this component only feeds it live device
 * state and renders the owed step in the Candlelit style over `gate.jpg`.
 *
 * It reuses the M2 Gate's push-subscribe flow and disguise choice verbatim — no
 * subscription logic is reimplemented here. Desktop and the goddess are never
 * held (the parent only mounts this for subjects; `jail()` frees desktop). It
 * mounts only after consent (inside the satisfied SubjectGate), never for
 * anonymous visitors, and never during the OAuth callback (not a shell route).
 * Presence keeps beating behind it — PresencePing is mounted independently.
 *
 * The "notifications" step plays in TWO BEATS, and the order is the point:
 *   1. "discreet" — BEFORE the browser's permission prompt, she settles how she
 *      will appear on their lock screen (masked as an ordinary, family-safe app
 *      vs. plainly as herself), with the true/masked previews side by side and
 *      the promise that it can be turned either way later from You. Either
 *      answer persists through the shared `setDisguiseMode` action.
 *   2. "allow" — only then the real `subscribeToPush` request.
 * Both beats are local component state; the pure `jail()` contract is untouched
 * (it still yields exactly "install" | "notifications" | free).
 */

function pushSupported(platform: Platform, iosVer: number | null): boolean {
  if (
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }
  // Web push needs iOS ≥ 16.4; older iPhones physically cannot carry it.
  if (platform === "ios" && (iosVer === null || iosVer < 16.4)) return false;
  return true;
}

export function Jail({ enabled }: { enabled: boolean }) {
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<JailResult>({ jailed: false, step: null });
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [iosVer, setIosVer] = useState<number | null>(null);
  const [notifDenied, setNotifDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  // null = they haven't answered the discreet question yet, so the notifications
  // step is still on beat 1. Answering it (either way) opens beat 2.
  const [disguise, setDisguise] = useState<boolean | null>(null);

  const vapidRef = useRef<string | null>(null);
  const androidPrompt = useRef<{ prompt: () => Promise<void> } | null>(null);

  // Read live device state and re-run the pure decision. Called on load, on
  // focus / tab-show, and when the display-mode flips (add-to-home-screen).
  const recompute = useCallback(() => {
    const p = detectPlatform();
    const ver = iosVersion();
    setPlatform(p);
    setIosVer(ver);

    // QA-only (compiled out of production builds): force a step for screenshots,
    // since a real jailed state needs a phone that isn't installed / hasn't
    // granted push. `?qaJail=install|notifications|off`.
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("qaJail");
      if (q === "install" || q === "notifications") {
        setResult({ jailed: true, step: q });
        return;
      }
      if (q === "off") {
        setResult({ jailed: false, step: null });
        return;
      }
    }

    const isMobile = p === "ios" || p === "android";
    const standalone = isStandalone();
    let pushPermission: PushPermission;
    if (!vapidRef.current) {
      // Push not configured server-side → don't demand it (fail-open).
      pushPermission = "unsupported";
    } else if (!pushSupported(p, ver)) {
      pushPermission = "unsupported";
    } else {
      pushPermission = Notification.permission as PushPermission;
    }
    setResult(jail({ isMobile, isStandalone: standalone, pushPermission, jailEnabled: enabled }));
  }, [enabled]);

  // Capture Android's install prompt so the Install button can fire it.
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
      vapidRef.current = await fetchVapidKey();
      if (cancelled) return;
      recompute();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [recompute]);

  // QA-only: render the forced step immediately, without waiting on the service
  // worker (compiled out of production). Never affects a real jailed decision.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(window.location.search).get("qaJail");
    if (q === "install" || q === "notifications") {
      recompute();
      setReady(true);
    }
  }, [recompute]);

  // Live re-check: releases the moment the app becomes standalone or push is
  // granted — no reload. The display-mode listener catches iOS add-to-home-screen
  // reopened in place; focus/visibility catch a return from Settings.
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (!document.hidden) recompute();
    };
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onMode = () => recompute();
    window.addEventListener("focus", recompute);
    document.addEventListener("visibilitychange", onVisible);
    mql?.addEventListener?.("change", onMode);
    return () => {
      window.removeEventListener("focus", recompute);
      document.removeEventListener("visibilitychange", onVisible);
      mql?.removeEventListener?.("change", onMode);
    };
  }, [ready, recompute]);

  // Beat 1 → beat 2. Either answer is a real answer: both persist through the
  // same own-user action the You page writes with, so the column is never left
  // guessing and the choice survives the reload they never have to make.
  const chooseDisguise = useCallback((next: boolean) => {
    setDisguise(next); // optimistic; persist via the shared server action
    void setDisguiseMode(next).catch(() => {});
  }, []);

  const doAndroidInstall = useCallback(async () => {
    if (androidPrompt.current) {
      try {
        await androidPrompt.current.prompt();
      } catch {
        /* ignore — display-mode change will release when they add it */
      }
    }
    recompute();
  }, [recompute]);

  const enableNotifications = useCallback(async () => {
    const vapid = vapidRef.current;
    if (!vapid) return;
    setBusy(true);
    try {
      const sub = await subscribeToPush(vapid);
      if (!sub) {
        setNotifDenied(true);
        recompute();
        return;
      }
      await registerDevice({
        deviceId: getDeviceId(),
        platform: detectPlatform(),
        installed: isStandalone(),
        pushEnabled: true,
        pushSubscription: sub,
      });
      recompute(); // Notification.permission is now "granted" → releases
    } finally {
      setBusy(false);
    }
  }, [recompute]);

  // Nothing to show until we've read the device, and never when not jailed.
  if (!ready || !result.jailed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[140] flex flex-col items-center justify-center overflow-y-auto px-6 py-12 text-center"
    >
      {/* gate.jpg backdrop — parted velvet, gold through the gap — dimmed under a
          near-black wash, with the slow gold breath over it. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={GATE_IMAGE} alt="" className="h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-bg/85 backdrop-blur-md" />
        <div
          className="breathe absolute inset-0"
          style={{
            background:
              "radial-gradient(55% 45% at 50% 42%, var(--color-accent-soft) 0%, transparent 72%)",
          }}
        />
      </div>

      <p className="mb-7 font-[family-name:var(--font-display)] text-5xl text-gold [text-shadow:0_0_50px_rgba(212,175,106,0.3)]">
        {copy.brand.mark}
      </p>
      <p className="mb-8 max-w-sm font-[family-name:var(--font-display)] text-lg italic text-text-dim">
        {copy.gate.wall.lead}
      </p>

      {result.step === "install" ? (
        <Panel
          title={copy.gate.wall.installTitle}
          body={
            platform === "ios"
              ? copy.gate.wall.installIosBody
              : copy.gate.wall.installAndroidBody
          }
        >
          {platform === "ios" ? (
            <>
              {iosVer !== null && iosVer < 16.4 ? (
                <Whisper className="mt-1">{copy.gate.iosOld}</Whisper>
              ) : null}
              <Whisper className="text-xs">{copy.gate.wall.openFromIcon}</Whisper>
            </>
          ) : (
            <Button variant="gold" size="lg" onClick={() => void doAndroidInstall()}>
              {copy.gate.installButton}
            </Button>
          )}
        </Panel>
      ) : disguise === null ? (
        /* Beat 1 — how she appears, settled BEFORE the browser ever prompts. */
        <Panel
          title={copy.gate.wall.discreetTitle}
          body={copy.gate.wall.discreetBody}
        >
          {/* The true-vs-masked previews, verbatim from the You page's card. */}
          <div className="w-full rounded-[var(--radius-lg)] border border-line/80 bg-surface/60 p-3 text-left">
            <p className="label-caps text-[0.625rem] text-gold">
              {copy.secret.previewIntro}
            </p>
            <div className="mt-2 flex gap-2">
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

          <div className="flex w-full flex-col items-stretch gap-3">
            <Button variant="gold" size="lg" onClick={() => chooseDisguise(true)}>
              {copy.gate.wall.discreetYes}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => chooseDisguise(false)}>
              {copy.gate.wall.discreetNo}
            </Button>
          </div>
          <Whisper className="text-xs">{copy.gate.wall.discreetAnytime}</Whisper>
        </Panel>
      ) : (
        /* Beat 2 — only now the real permission request. */
        <Panel title={copy.gate.wall.notifTitle} body={copy.gate.wall.notifBody}>
          <Whisper className="-mt-1 text-sm italic text-gold/80">
            {disguise
              ? copy.gate.wall.discreetChoseMask
              : copy.gate.wall.discreetChosePlain}
          </Whisper>

          <Button
            variant="gold"
            size="lg"
            loading={busy}
            onClick={() => void enableNotifications()}
          >
            {copy.gate.wall.notifButton}
          </Button>
          <Whisper className="text-xs">{copy.gate.wall.notifRequired}</Whisper>
          {notifDenied ? (
            <Whisper className="mt-3">{copy.gate.wall.notifDenied}</Whisper>
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
      <Ornament className="mx-auto mt-4 w-28" />
      <Whisper className="mt-4 text-base leading-relaxed">{body}</Whisper>
      <div className="mt-9 flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}
