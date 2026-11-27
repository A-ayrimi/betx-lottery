"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { usd } from "@/lib/format";
import { payoutVars } from "@/lib/payoutCopy";
import { AnimatedMoney } from "./AnimatedMoney";
import { GoldDollars3D } from "./GoldDollars3D";
import { OnchainTreasury } from "./OnchainTreasury";
import { BalanceBadge } from "./BalanceBadge";
import { useI18n } from "@/i18n/client";

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.62, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Hero() {
  const { state, loading, dataUnavailable, isPreview, isDemoSession, setToast } = useApp();
  const { d, t, n, locale } = useI18n();
  const v = state?.vault;
  const tier = state?.tiers[0];
  const profit = v ? v.balance - v.initialCapital : null;
  const maintenance = Boolean(state?.config?.maintenanceMode ?? state?.config?.maintenance);
  const demo = isPreview || isDemoSession || (state ? !state.config.live : false);
  const statusLabel = dataUnavailable
    ? d.ui.statusUnavailable
    : loading
      ? d.ui.statusLoading
      : maintenance
        ? d.ui.statusMaintenance
        : demo
          ? d.ui.statusDemo
          : state
            ? d.ui.statusOnline
            : d.ui.statusUnavailable;
  const statusOnline = !dataUnavailable && !loading && !maintenance && !demo && Boolean(state);
  const payout = payoutVars(tier ?? null, locale);

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/vault.svg"
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_50%] opacity-[0.42] rtl:-scale-x-100"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,10,9,0.97)_0%,rgba(6,10,9,0.82)_45%,rgba(6,10,9,0.25)_100%)] rtl:bg-[linear-gradient(270deg,rgba(6,10,9,0.97)_0%,rgba(6,10,9,0.82)_45%,rgba(6,10,9,0.25)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,9,0.9)_0%,transparent_22%,transparent_62%,#060a09_100%)]" />
      </div>

      <GoldDollars3D count={34} seed={7} side="end" parallax className="dollar-mask-end" />

      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pb-28 lg:pt-24">
        <div className="legible">
          <motion.p
            custom={0}
            variants={fade}
            initial="hidden"
            animate="show"
            dir="ltr"
            className="micro inline-flex items-center gap-2 rounded-full border border-foil/30 bg-foil/[0.08] px-3.5 py-2 text-foil"
          >
            {d.ui.heroBadge}
          </motion.p>

          <motion.h1
            custom={1}
            variants={fade}
            initial="hidden"
            animate="show"
            className="mt-6 text-[clamp(2.5rem,7.6vw,5.4rem)] font-black leading-[1.05] tracking-tight text-white"
          >
            {d.hero.title1}
            <br />
            <span className="gold-text">{d.hero.titleGold}</span>
          </motion.h1>

          <motion.p custom={2} variants={fade} initial="hidden" animate="show" className="mt-6 max-w-[54ch] text-[17px] leading-9 text-mint">
            {t(d.hero.body, payout)}
          </motion.p>

          <motion.div custom={3} variants={fade} initial="hidden" animate="show" className="mt-9 flex flex-wrap items-center gap-3">
            <a href="#wheel" className="btn-neon cta-breathe focus-ring rounded-2xl px-7 py-4 text-base font-bold">
              {d.hero.ctaWheel}
            </a>
            <a
              href="#pool"
              aria-disabled={maintenance}
              className={`btn-foil rounded-2xl px-7 py-4 text-base font-bold ${maintenance ? "opacity-60" : "cta-breathe focus-ring"}`}
            >
              {maintenance ? d.ui.statusMaintenance : d.hero.ctaTicket}
            </a>
            <button
              onClick={() => setToast(t(d.hero.howToast, payout))}
              className="focus-ring rounded-2xl border border-rule px-5 py-4 text-sm text-mint transition-colors hover:border-mint/50 hover:text-white"
            >
              {d.hero.ctaHow}
            </button>
          </motion.div>

          <motion.div custom={4} variants={fade} initial="hidden" animate="show" className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Stat label={d.ui.statInitialLabel} value={v ? `${usd(v.initialCapital, locale)}` : d.ui.noData} note={d.hero.statInitial} />
            <Stat
              label={d.ui.statProfitLabel}
              value={profit === null ? d.ui.noData : `${profit > 0 ? "+" : ""}${usd(profit, locale)}`}
              note={d.hero.statProfit}
              tone="foil"
            />
            <Stat label={d.ui.statRoundsLabel} value={v ? n(v.roundsCompleted) : d.ui.noData} note={d.hero.statRounds} />
            <Stat label={d.ui.statPlayersLabel} value={state ? n(state.stats.players) : d.ui.noData} note={d.hero.statPlayers} />
          </motion.div>
        </div>

        <motion.aside
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="panel grain relative overflow-hidden rounded-[26px] p-7"
        >
          <div className="guilloche pointer-events-none absolute inset-0 opacity-80" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="micro flex flex-wrap items-center gap-2 text-mint">
                {d.hero.liveVault}
                <BalanceBadge kind={demo ? "demo" : "ledger"} />
              </p>
              <span className="flex items-center gap-2" aria-live="polite">
                <span className={`h-2 w-2 rounded-full ${statusOnline ? "live-dot bg-neon-2" : "bg-foil"}`} />
                <span dir="auto" className="font-display text-[11px] tracking-[0.14em] text-neon-2">{statusLabel}</span>
              </span>
            </div>

            <p dir="ltr" className="font-display tnum mt-5 text-[clamp(2.8rem,7vw,4.1rem)] font-bold leading-none text-white">
              {v ? <AnimatedMoney value={v.balance} /> : d.ui.noData}
            </p>
            <p role={dataUnavailable ? "alert" : undefined} className="mt-2 text-sm text-mint">
              {v ? d.hero.cashNote : statusLabel}
            </p>

            <div className="mt-4 rounded-xl border border-foil/25 bg-foil/[0.06] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="micro text-foil">{d.hero.treasury}</p>
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-foil" />
              </div>
              <p dir="ltr" className="font-display mt-2 truncate text-start text-[12px] tracking-[0.06em] text-foil">
                {v?.adminWallet ?? state?.config.adminWallet ?? d.ui.noData}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-mint">
                <span>
                  {d.hero.treasuryAllocation}:{" "}
                  <span dir="ltr" className="font-display tnum font-bold text-white">
                    {v ? `${usd(v.totalFees, locale)}` : d.ui.noData}
                  </span>
                </span>
                <span className="text-foil/80">
                  {d.hero.adminEarnings}:{" "}
                  <span dir="ltr" className="font-display tnum font-bold text-white">
                    {v ? `${usd(v.adminEarnings, locale)}` : d.ui.noData}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-[10px] text-mint/60">{t(d.hero.treasuryNote, payout)}</p>
            </div>

            <div className="mt-3">
              <OnchainTreasury demo={state ? !state.config.live : demo} />
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <Cell
                label={d.hero.cellFee}
                value={tier ? `${usd(tier.treasury, locale)} + ${usd(tier.admin, locale)}` : state ? `${usd(state.config.treasuryContributionPerRound, locale)} + ${usd(state.config.adminGrossRevenuePerRound, locale)}` : d.ui.noData}
                note={t(d.hero.cellFeeNote, payout)}
              />
              <Cell label={d.hero.cellPrize} value={tier ? `${usd(tier.prize, locale)}` : state ? `${usd(state.config.prizePerRound, locale)}` : d.ui.noData} note={t(d.hero.cellPrizeNote, payout)} />
              <Cell label={d.hero.cellOdds} value={tier ? `${n(1)}/${n(tier.capacity)}` : state ? `${n(1)}/${n(state.config.roundCapacity)}` : d.ui.noData} note={t(d.hero.cellOddsNote, payout)} />
              <Cell label={d.hero.cellCap} value={tier ? n(tier.capacity) : state ? n(state.config.roundCapacity) : d.ui.noData} note={t(d.hero.cellCapNote, payout)} />
            </div>

            {v ? (
              <p className="mt-6 rounded-xl border border-neon/20 bg-neon/[0.06] px-4 py-3 text-[13px] leading-7 text-mint">
                <span className="text-neon-2">◆</span> {t(d.hero.floor, { amount: `${usd(v.initialCapital, locale)}` })}
              </p>
            ) : null}
          </div>
        </motion.aside>
      </div>
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "foil" }) {
  return (
    <div>
      <p className="micro text-mint">{label}</p>
      <p dir="ltr" className={`font-display tnum mt-1.5 text-2xl font-bold ${tone === "foil" ? "text-foil" : "text-white"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-mint/70">{note}</p>
    </div>
  );
}

function Cell({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-rule bg-black/25 px-4 py-3">
      <p className="text-[11px] text-mint">{label}</p>
      <p dir="ltr" className="font-display tnum mt-1 text-xl font-bold text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-mint/70">{note}</p>
    </div>
  );
}
