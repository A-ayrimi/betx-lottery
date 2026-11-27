"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useI18n } from "@/i18n/client";
import { formatNumber, formatPadded, usd } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { weeklyJackpotSplit } from "@/lib/rewardEngine";
import { allocateVault } from "@/lib/vaultAccounts";

function nextSundayUtc(from: Date) {
  const days = from.getUTCDay() === 0 ? 7 : 7 - from.getUTCDay();
  return Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days, 0, 0, 0, 0);
}

function formatCountdown(ms: number, locale: Locale) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const dayLabels: Record<Locale, string> = { en: "d", es: "d", fa: "روز", ar: "يوم", tr: "g", ru: "д" };
  return `${formatNumber(days, locale)} ${dayLabels[locale]} ${formatPadded(hours, locale)}:${formatPadded(minutes, locale)}:${formatPadded(seconds, locale)}`;
}

export function WeeklyJackpotWidget() {
  const { state } = useApp();
  const { d, t, locale } = useI18n();
  const c = d.phase2.jackpot;
  const [left, setLeft] = useState("");

  useEffect(() => {
    const tick = () => setLeft(formatCountdown(nextSundayUtc(new Date()) - Date.now(), locale));
    const frame = window.requestAnimationFrame(tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, [locale]);

  const grossCents = Math.max(0, Math.round(Number(state?.vault.totalFees ?? 0) * 100));
  const allocation = allocateVault(grossCents);
  const pot = Number.isSafeInteger(grossCents) ? weeklyJackpotSplit(allocation.jackpotCents) : null;

  return (
    <section id="jackpot" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-labelledby="jackpot-title">
      <div className="panel relative overflow-hidden rounded-3xl border-foil/30 bg-foil/[0.04] p-6 sm:p-8">
        <p className="micro text-foil">{c.kicker}</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <h2 id="jackpot-title" className="text-[clamp(1.9rem,4.2vw,3rem)] font-black leading-[1.1] text-white">
              {c.title1}
              <br />
              <span className="gold-text">{c.titleGold}</span>
            </h2>
            <p className="mt-4 max-w-[58ch] text-[14px] leading-8 text-mint">{c.body}</p>
            <p className="mt-4 text-[11px] leading-6 text-mint/70">{c.note}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-rule bg-black/25 p-4">
              <p className="micro text-neon-2">{c.growthBudget}</p>
              <p dir="ltr" className="mt-2 font-display tnum text-2xl font-black text-white">
                {usd(allocation.growthCents / 100, locale)}
              </p>
            </div>
            <div className="rounded-2xl border border-rule bg-black/25 p-4">
              <p className="micro text-foil">{t(c.resetIn, { time: left })}</p>
              <p dir="ltr" className="mt-2 font-display tnum text-xl font-black text-foil">{left}</p>
            </div>
            <div className="rounded-2xl border border-rule bg-black/25 p-4 sm:col-span-2">
              <p className="micro text-foil">{c.potEstimate}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-mint">{c.first}</p>
                  <p dir="ltr" className="font-display tnum text-[13px] font-bold text-white">{usd((pot?.firstCents ?? 0) / 100, locale)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mint">{c.second}</p>
                  <p dir="ltr" className="font-display tnum text-[13px] font-bold text-white">{usd((pot?.secondCents ?? 0) / 100, locale)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mint">{c.third}</p>
                  <p dir="ltr" className="font-display tnum text-[13px] font-bold text-white">{usd((pot?.thirdCents ?? 0) / 100, locale)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
