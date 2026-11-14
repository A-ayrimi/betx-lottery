"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { useI18n } from "@/i18n/client";
import { useInstallPrompt } from "./InstallPrompt";

/** Standalone install page: one guide per platform, plus the live install button. */
export function InstallGuide() {
  const { d, locale } = useI18n();
  const [tab, setTab] = useState<"ios" | "android" | "desktop">("android");
  const { install, installed, canInstall, isIos } = useInstallPrompt();

  const platforms = [
    { id: "ios" as const, label: d.pwa.installIos, title: d.pwa.pwaIosTitle, steps: d.pwa.pwaIosSteps, icon: "ios" },
    { id: "android" as const, label: d.pwa.installAndroid, title: d.pwa.pwaAndroidTitle, steps: d.pwa.pwaAndroidSteps, icon: "android" },
    { id: "desktop" as const, label: d.pwa.installDesktop, title: d.pwa.pwaDesktopTitle, steps: d.pwa.pwaDesktopSteps, icon: "desktop" },
  ];
  const active = platforms.find((p) => p.id === tab) ?? platforms[1];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/${locale}`} className="focus-ring rounded-lg" dir="ltr" aria-label="BETX">
          <Logo />
        </Link>
        <Link href={`/${locale}`} className="text-sm text-mint hover:text-white">
          {d.pwa.installBack}
        </Link>
      </div>

      <p className="micro mt-10 text-neon-2">{d.pwa.installKicker}</p>
      <h1 className="mt-3 text-[clamp(1.9rem,5vw,3rem)] font-black leading-tight text-white">{d.pwa.installTitle}</h1>
      <p className="mt-4 max-w-[62ch] text-[15px] leading-8 text-mint">{d.pwa.installBody}</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {installed ? (
          <p className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-3 text-sm text-neon-2">✓ {d.pwa.pwaInstalled}</p>
        ) : (
          <button
            onClick={install}
            disabled={!canInstall}
            title={!canInstall ? (isIos ? d.pwa.pwaIosTitle : d.pwa.installGuide) : undefined}
            className="btn-neon focus-ring rounded-xl px-6 py-3.5 text-base font-bold disabled:opacity-60"
          >
            {d.pwa.installCta}
          </button>
        )}
        <span className="rounded-full border border-rule px-4 py-2 text-[12px] text-mint">{d.pwa.platforms}</span>
      </div>
      <p className="mt-3 text-[12px] text-mint/70">{d.pwa.pwaNote}</p>
      {!canInstall && !installed ? (
        <p className="mt-2 text-[12px] leading-6 text-foil">
          {isIos ? d.pwa.pwaIosTitle : d.pwa.installGuide}
        </p>
      ) : null}

      <div className="mt-10 grid gap-2 sm:grid-cols-3 [&>*]:min-w-0" role="tablist" aria-label={d.pwa.installTitle}>
        {platforms.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={tab === p.id}
            onClick={() => setTab(p.id)}
            className={`focus-ring flex items-center gap-3 rounded-xl border px-4 py-4 text-start transition-colors ${
              tab === p.id ? "border-neon/50 bg-neon/[0.08]" : "border-rule bg-white/[0.02] hover:border-mint/40"
            }`}
          >
            <PlatformIcon kind={p.icon} />
            <span className="text-sm font-bold text-white">{p.label}</span>
          </button>
        ))}
      </div>

      <section className="panel mt-4 rounded-2xl p-6" aria-live="polite">
        <h2 className="text-xl font-black text-white">{active.title}</h2>
        <ol className="mt-4 space-y-3">
          {active.steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-[14px] leading-7 text-mint">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neon/15 font-display text-[12px] font-bold text-neon-2">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="panel mt-4 grid gap-3 rounded-2xl p-6 sm:grid-cols-2 [&>*]:min-w-0">
        {d.pwa.installBenefits.map((b) => (
          <p key={b} className="flex items-center gap-2 text-[13px] text-mint">
            <span className="text-neon-2">◆</span> {b}
          </p>
        ))}
      </div>
    </main>
  );
}

function PlatformIcon({ kind }: { kind: string }) {
  const common = { className: "h-6 w-6 shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true } as const;
  if (kind === "ios")
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M10.5 5h3" />
      </svg>
    );
  if (kind === "android")
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <rect x="5" y="7" width="14" height="12" rx="2.5" />
        <path d="M8 7 6.5 4M16 7l1.5-3M9.5 11v2M14.5 11v2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" {...common}>
      <rect x="2.5" y="4" width="19" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
