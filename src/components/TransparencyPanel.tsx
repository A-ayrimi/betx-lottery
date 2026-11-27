"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useI18n } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { formatPadded, usd } from "@/lib/format";
import { OnchainTreasury } from "./OnchainTreasury";
import { BalanceBadge } from "./BalanceBadge";

function formatRemaining(ms: number, locale: Locale) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${formatPadded(hh, locale)}:${formatPadded(mm, locale)}:${formatPadded(ss, locale)}`;
}

function useCountdown(iso: string | null, locale: Locale) {
  const [left, setLeft] = useState("");

  useEffect(() => {
    const target = iso ? new Date(iso).getTime() : Number.NaN;
    if (!Number.isFinite(target)) {
      const frame = window.requestAnimationFrame(() => setLeft(""));
      return () => window.cancelAnimationFrame(frame);
    }
    const tick = () => setLeft(formatRemaining(target - Date.now(), locale));
    const frame = window.requestAnimationFrame(tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, [iso, locale]);

  return left;
}

export function TransparencyPanel() {
  const { state, demoEnabled, isPreview } = useApp();
  const { d, href, locale } = useI18n();
  const c = d.phase2.transparency;
  const round = state?.round ?? null;
  const left = useCountdown(round?.closesAt ?? null, locale);
  const hash = round?.seedHash ?? null;
  const maintenance = Boolean(state?.config?.maintenanceMode ?? state?.config?.maintenance);
  const paused = maintenance || isPreview;

  return (
    <section id="transparency" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="transparency-title">
      <p className="micro text-neon-2">{c.kicker}</p>
      <h2 id="transparency-title" className="mt-4 text-[clamp(2rem,4.6vw,3.4rem)] font-black leading-[1.1] text-white">
        {c.title1}
        <br />
        <span className="gold-text">{c.titleGold}</span>
      </h2>
      <p className="mt-4 max-w-[70ch] text-[15px] leading-8 text-mint">{c.body}</p>

      <div className="mt-9 grid gap-5 lg:grid-cols-2">
        <div className="panel rounded-2xl p-5">
          <p className="micro text-foil">{c.comparisonTitle}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-start text-[12px]">
              <thead>
                <tr className="border-b border-rule text-neon-2">
                  <th className="py-2 text-start font-semibold">{c.comparisonHeaders[0]}</th>
                  <th className="py-2 text-start font-semibold">{c.comparisonHeaders[1]}</th>
                  <th className="py-2 text-start font-semibold">{c.comparisonHeaders[2]}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.label} className="border-b border-rule/60 last:border-0">
                    <td className="py-3 pe-3 font-semibold text-white">{row.label}</td>
                    <td className="py-3 pe-3 text-neon-2">{row.betx}</td>
                    <td className="py-3 text-mint/70">{row.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel rounded-2xl p-5">
            <p className="micro text-foil">{c.vaultTitle}</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-[11px] text-mint">
                  {c.ledgerBalance}
                  <BalanceBadge kind={isPreview || demoEnabled ? "demo" : "ledger"} />
                </p>
                <p dir="ltr" className="font-display tnum text-2xl font-black text-white">
                  {usd(state?.vault.balance ?? 0, locale)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-mint">{c.ledgerStatus}</p>
                <p className="font-display text-[12px] font-bold text-foil">
                  {isPreview
                    ? d.wc.demoBadge
                    : state?.vault.ledgerStatus === "verified"
                      ? c.ledgerVerified
                      : c.ledgerHistorical}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-6 text-mint/80">{c.vaultNote}</p>
            <div className="mt-3">
              <OnchainTreasury demo={isPreview || demoEnabled} compact />
            </div>
          </div>

          <div className="panel rounded-2xl p-5">
            <p className="micro text-foil">{c.hashTitle}</p>
            {hash ? (
              <>
                <p dir="ltr" className="mt-3 truncate rounded-lg border border-rule bg-black/25 px-3 py-2 font-display text-[11px] text-neon-2" title={hash}>
                  {hash.length > 34 ? `${hash.slice(0, 18)}…${hash.slice(-10)}` : hash}
                </p>
                <a href={href("/verify")} className="focus-ring mt-3 inline-block rounded-lg px-3 py-2 text-[12px] font-bold text-foil underline-offset-4 hover:underline">
                  {c.verifyLink} ↗
                </a>
              </>
            ) : (
              <p className="mt-3 text-[12px] text-foil">{c.noRound}</p>
            )}
          </div>

          <div className="panel rounded-2xl p-5">
            <p className="micro text-foil">{c.refundTitle}</p>
            <p className="mt-3 text-[12px] leading-7 text-mint">{c.refundNote}</p>
            <p dir="ltr" className="mt-3 font-display tnum text-2xl font-black text-foil">
              {paused ? (maintenance ? d.ui.statusMaintenance : d.ui.statusDemo) : left || c.noRound}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
