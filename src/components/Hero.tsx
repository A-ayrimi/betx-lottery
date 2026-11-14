"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { money } from "@/lib/format";
import { AnimatedMoney } from "./AnimatedMoney";
import { GoldDollars3D } from "./GoldDollars3D";
import { OnchainTreasury } from "./OnchainTreasury";
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
  const { state, setToast } = useApp();
  const { d, t, n } = useI18n();
  const v = state?.vault;
  const profit = v ? Math.max(0, v.balance - v.initialCapital) : 0;

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/vault.jpg"
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
            PLAY SMART. WIN INSTANT. <span className="text-neon-2">◆</span> USDT
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
            {t(d.hero.body, { prize: "$15" })}
          </motion.p>

          <motion.div custom={3} variants={fade} initial="hidden" animate="show" className="mt-9 flex flex-wrap items-center gap-3">
            <a href="#wheel" className="btn-neon cta-breathe focus-ring rounded-2xl px-7 py-4 text-base font-bold">
              {d.hero.ctaWheel}
            </a>
            <a href="#pool" className="btn-foil cta-breathe focus-ring rounded-2xl px-7 py-4 text-base font-bold">
              {d.hero.ctaTicket}
            </a>
            <button
              onClick={() => setToast(d.hero.howToast)}
              className="focus-ring rounded-2xl border border-rule px-5 py-4 text-sm text-mint transition-colors hover:border-mint/50 hover:text-white"
            >
              {d.hero.ctaHow}
            </button>
          </motion.div>

          <motion.div custom={4} variants={fade} initial="hidden" animate="show" className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Stat label="INITIAL VAULT" value={`$${money(v?.initialCapital ?? 20)}`} note={d.hero.statInitial} />
            <Stat label="NET PROFIT" value={`+$${money(profit)}`} note={d.hero.statProfit} tone="foil" />
            <Stat label="ROUNDS PAID" value={n(v?.roundsCompleted ?? 0)} note={d.hero.statRounds} />
            <Stat label="PLAYERS" value={n(state?.stats.players ?? 0)} note={d.hero.statPlayers} />
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
              <p className="micro text-mint">{d.hero.liveVault}</p>
              <span className="flex items-center gap-2">
                <span className="live-dot h-2 w-2 rounded-full bg-neon-2" />
                <span dir="ltr" className="font-display text-[11px] tracking-[0.22em] text-neon-2">ONLINE</span>
              </span>
            </div>

            <p dir="ltr" className="font-display tnum mt-5 text-[clamp(2.8rem,7vw,4.1rem)] font-bold leading-none text-white">
              <AnimatedMoney value={v?.balance ?? 20} />
            </p>
            <p className="mt-2 text-sm text-mint">{d.hero.cashNote}</p>

            <div className="mt-4 rounded-xl border border-foil/25 bg-foil/[0.06] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="micro text-foil">{d.hero.treasury}</p>
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-foil" />
              </div>
              <p dir="ltr" className="font-display mt-2 truncate text-start text-[12px] tracking-[0.06em] text-foil">
                {v?.adminWallet ?? state?.config.adminWallet ?? ""}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-mint">
                <span>
                  {d.hero.adminEarnings}:{" "}
                  <span dir="ltr" className="font-display tnum font-bold text-white">
                    ${money(v?.adminEarnings ?? v?.totalFees ?? 0)}
                  </span>
                </span>
                <span className="text-foil/80">{d.hero.autoFee}</span>
              </div>
              <p className="mt-1 text-[10px] text-mint/60">{d.hero.treasuryNote}</p>
            </div>

            <div className="mt-3">
              <OnchainTreasury demo={!state?.config.live} />
            </div>

            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0b6b48,#35ffb0_60%,#e9c46a)]"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (v?.balance ?? 20))}%` }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
              />
            </div>
            <div dir="ltr" className="mt-2 flex justify-between font-display text-[10px] tracking-[0.2em] text-mint">
              <span>$0</span>
              <span>$100 TARGET</span>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <Cell label={d.hero.cellFee} value="25%" note={d.hero.cellFeeNote} />
              <Cell label={d.hero.cellPrize} value="$15" note={d.hero.cellPrizeNote} />
              <Cell label={d.hero.cellOdds} value="1/20" note={d.hero.cellOddsNote} />
              <Cell label={d.hero.cellCap} value="20" note={d.hero.cellCapNote} />
            </div>

            <p className="mt-6 rounded-xl border border-neon/20 bg-neon/[0.06] px-4 py-3 text-[13px] leading-7 text-mint">
              <span className="text-neon-2">◆</span> {t(d.hero.floor, { amount: `$${money(v?.initialCapital ?? 20)}` })}
            </p>
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
