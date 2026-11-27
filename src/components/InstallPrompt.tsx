"use client";

import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useI18n } from "@/i18n/client";

/** Chromium's install event (not yet in the DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __betxInstall?: { canInstall: boolean; run: () => Promise<void>; installed: boolean; ios: boolean };
  }
}

const DISMISS_KEY = "betx_install_dismissed";
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Shared install state.
 * - Chromium (Android / Windows / macOS / Linux / ChromeOS): native install prompt
 * - iOS Safari: no API, so we surface Add-to-Home-Screen steps
 * - already installed: report it and stop asking
 */
const noopSubscribe = () => () => {};
const isIosDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  // SSR-safe: server snapshot says "installed" so the banner never flashes on first paint
  const installed = useSyncExternalStore(noopSubscribe, isStandalone, () => true) || justInstalled;
  const ios = useSyncExternalStore(noopSubscribe, isIosDevice, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setEvt(null);
      try {
        localStorage.setItem("betx_installed", "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setJustInstalled(true);
    setEvt(null);
    return outcome === "accepted";
  }, [evt]);

  const canInstall = Boolean(evt) && !installed;
  return { canInstall, install, installed, isIos: ios };
}

/**
 * Recommends installing the app. Appears after a short delay, is dismissible
 * for 14 days, and never shows when running as an installed app.
 */
export function InstallBanner() {
  const { d, locale, n } = useI18n();
  const { canInstall, install, installed, isIos } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (installed) return;
    let dismissedAt = 0;
    try {
      dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    } catch {
      /* storage blocked */
    }
    const cool = 14 * 24 * 3600 * 1000;
    if (Date.now() - dismissedAt < cool) return;
    const id = window.setTimeout(() => setShow(true), 6000);
    return () => window.clearTimeout(id);
  }, [installed]);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked */
    }
  };

  const steps = isIos ? d.pwa.pwaIosSteps : d.pwa.pwaAndroidSteps;

  return (
    <AnimatePresence>
      {show && !installed ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-[86] mx-auto w-auto max-w-md rounded-2xl border border-neon/25 bg-[#0b1512]/97 p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur sm:start-4 sm:mx-0"
          role="dialog"
          aria-live="polite"
          aria-label={d.pwa.pwaTitle}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neon/30 bg-neon/10 p-1.5">
              {/* app icon mark */}
              <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
                <defs>
                  <linearGradient id="betx-foil" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#35FFB0" />
                    <stop offset="52%" stopColor="#10E28E" />
                    <stop offset="100%" stopColor="#E9C46A" />
                  </linearGradient>
                </defs>
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  fill="url(#betx-foil)"
                  d="M12,4 H52 A8,8 0 0 1 60,12 V24 A8,8 0 0 0 60,40 V52 A8,8 0 0 1 52,60 H12 A8,8 0 0 1 4,52 V40 A8,8 0 0 0 4,24 V12 A8,8 0 0 1 12,4 Z
                     M20,15 L29,15 L45,49 L36,49 Z M35,15 L44,15 L28,49 L19,49 Z"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-white">{d.pwa.pwaTitle}</p>
              <p className="mt-1 text-[12px] leading-6 text-mint">{d.pwa.pwaBody}</p>
              <p className="mt-1 text-[11px] text-mint/60">{d.pwa.platforms}</p>
            </div>
            <button onClick={dismiss} aria-label={d.pwa.close} className="focus-ring -me-1 -mt-1 rounded-lg p-1.5 text-mint hover:text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <AnimatePresence>
            {showSteps ? (
              <motion.ol
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-1.5 overflow-hidden rounded-xl border border-rule bg-black/25 p-3"
              >
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-2 text-[12px] leading-6 text-mint">
                    <span className="font-display font-bold text-neon-2">{n(i + 1)}.</span> {s}
                  </li>
                ))}
              </motion.ol>
            ) : null}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap gap-2">
            {canInstall ? (
              <button
                onClick={async () => {
                  const ok = await install();
                  if (ok) setShow(false);
                }}
                className="btn-neon focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm font-bold"
              >
                {d.pwa.pwaInstall}
              </button>
            ) : (
              <button onClick={() => setShowSteps((v) => !v)} className="btn-foil focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm font-bold">
                {d.pwa.installGuide}
              </button>
            )}
            <Link href={`/${locale}/install`} className="focus-ring rounded-xl border border-rule px-4 py-2.5 text-sm text-mint hover:text-white">
              {d.pwa.platforms.split(" · ")[0]}…
            </Link>
            <button onClick={dismiss} className="focus-ring rounded-xl px-3 py-2.5 text-sm text-mint/70 hover:text-white">
              {d.pwa.pwaLater}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
