"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useI18n } from "@/i18n/client";
import { previewProgress } from "@/lib/demoSession";
import { formatCurrency, formatPercent } from "@/lib/format";
import { winnerAmountsForTier } from "@/lib/tierMath";

interface TierProgress {
  code: string;
  tierNumber: number;
  roundId: number | null;
  sold: number;
  capacity: number;
  remaining: number;
  seedHash: string | null;
  closesAt: string | null;
}

export function TierCards() {
  const { state, demoEnabled, isPreview, selectedTierCode, setSelectedTierCode, setToast } = useApp();
  const { d, t, n, locale } = useI18n();
  const [progress, setProgress] = useState<Record<string, TierProgress>>(() => {
    const next: Record<string, TierProgress> = {};
    if (demoEnabled) for (const item of previewProgress()) next[item.code] = item;
    return next;
  });

  useEffect(() => {
    if (isPreview) {
      const id = window.setTimeout(() => {
        const next: Record<string, TierProgress> = {};
        for (const item of previewProgress()) next[item.code] = item;
        setProgress(next);
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (demoEnabled) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/tiers/progress", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; tiers?: TierProgress[] };
        if (!alive || !res.ok || !json.ok || !Array.isArray(json.tiers)) return;
        const next: Record<string, TierProgress> = {};
        for (const item of json.tiers) next[item.code] = item;
        setProgress(next);
      } catch {
        if (alive) setProgress({});
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [demoEnabled, isPreview]);

  const tiers = state?.tiers ?? [];
  if (!tiers.length) return null;

  const c = d.phase2.tiers;
  const maintenance = isPreview || Boolean(state?.config?.maintenanceMode ?? state?.config?.maintenance);
  const active = selectedTierCode || state?.round?.tierCode || tiers[0]?.code;

  const selectTier = (code: string) => {
    if (maintenance) {
      setToast(c.actionDisabled);
      return;
    }
    setSelectedTierCode(code);
    document.getElementById("pool")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="tiers" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="tiers-title">
      <p className="micro text-neon-2">{c.kicker}</p>
      <h2 id="tiers-title" className="mt-4 text-[clamp(2rem,4.6vw,3.4rem)] font-black leading-[1.1] text-white">
        {c.title1}
        <br />
        <span className="gold-text">{c.titleGold}</span>
      </h2>
      <p className="mt-4 max-w-[70ch] text-[15px] leading-8 text-mint">{c.body}</p>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tiers.map((tier) => {
          const live = progress[tier.code];
          const fallback = tier.code === state?.round?.tierCode
            ? { sold: state.round?.sold ?? 0, capacity: state.round?.capacity ?? tier.capacity }
            : { sold: 0, capacity: tier.capacity };
          const capacity = Math.max(1, live?.capacity ?? fallback.capacity);
          const sold = Math.max(0, Math.min(capacity, live?.sold ?? fallback.sold));
          const remaining = Math.max(0, capacity - sold);
          const pct = Math.min(100, Math.round((sold / capacity) * 100));
          const winnerAmount = winnerAmountsForTier({ code: tier.code, prize: tier.prize, rules: tier.rules })[0];
          const kyc = tier.displayOrder >= 6 || /diamond|vip/i.test(tier.code);
          const selected = active === tier.code;

          return (
            <article
              key={tier.code}
              className={`panel relative flex flex-col rounded-2xl p-5 transition ${
                selected
                  ? maintenance
                    ? "border-rule bg-white/[0.02] opacity-70"
                    : "border-foil/60 bg-foil/[0.07] shadow-[0_0_28px_rgba(233,196,106,0.12)]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="micro text-foil">{tier.name}</p>
                  <p dir="ltr" className="mt-1 font-display tnum text-3xl font-black text-white">
                    {formatCurrency(tier.priceUsd, locale)}
                  </p>
                </div>
                <span className="rounded-full border border-rule bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-mint">
                  #{n(tier.displayOrder)}
                </span>
              </div>

              {kyc ? (
                <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-foil/40 bg-foil/10 px-2.5 py-1 text-[10px] font-bold text-foil">
                  <span aria-hidden="true">✓</span> {c.kycRequired}
                </p>
              ) : null}

              <div className="mt-5 space-y-2 rounded-xl border border-rule bg-black/20 p-3">
                <p className="micro text-neon-2">{c.prizes}</p>
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="text-mint">{c.winner}</span>
                  <span dir="ltr" className="font-display tnum font-bold text-white">{formatCurrency(winnerAmount, locale)}</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2 text-[11px] text-mint">
                  <span className="micro">{c.liveProgress}</span>
                  <span dir="ltr" className="font-display tnum text-foil">{formatPercent(pct / 100, locale)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={sold}>
                  <div className="h-full rounded-full bg-gradient-to-r from-neon-2 to-foil" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span dir="ltr" className="font-display tnum text-white">{t(c.sold, { n: n(sold) })}</span>
                  <span dir="ltr" className="font-display tnum text-foil">{t(c.left, { n: n(remaining) })}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-neon/[0.07] px-1 py-2">
                  <p className="text-[10px] text-neon-2">{c.prizeShare}</p>
                  <p className="font-display tnum text-[11px] font-bold text-white">{formatPercent(tier.prizePercentage / 100, locale)}</p>
                </div>
                <div className="rounded-lg bg-foil/[0.07] px-1 py-2">
                  <p className="text-[10px] text-foil">{c.vaultShare}</p>
                  <p className="font-display tnum text-[11px] font-bold text-white">{formatPercent(tier.treasuryPercentage / 100, locale)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.04] px-1 py-2">
                  <p className="text-[10px] text-mint">{c.siteShare}</p>
                  <p className="font-display tnum text-[11px] font-bold text-white">{formatPercent(tier.adminPercentage / 100, locale)}</p>
                </div>
              </div>

              <p className="mt-4 rounded-lg border border-rule bg-white/[0.02] px-3 py-2 text-[10px] leading-5 text-mint">
                <span className="text-neon-2">◆</span> {c.refund}
              </p>
              {kyc ? <p className="mt-1 px-3 text-[10px] leading-5 text-foil">{c.kycDetail}</p> : null}

              <button
                type="button"
                onClick={() => selectTier(tier.code)}
                disabled={maintenance}
                aria-pressed={selected && !maintenance}
                className={`focus-ring mt-5 w-full rounded-xl px-4 py-3 text-[12px] font-bold transition disabled:opacity-60 ${
                  maintenance ? "border border-rule bg-white/[0.03] text-mint" : selected ? "btn-foil" : "btn-neon"
                }`}
              >
                {maintenance ? c.actionDisabled : selected ? c.selected : c.select}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
