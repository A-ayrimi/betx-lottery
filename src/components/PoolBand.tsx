"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { GoldDollars3D } from "./GoldDollars3D";
import { burstDollars, burstFrom } from "@/lib/dollarFx";
import type { AppState } from "@/lib/types";

export function PoolBand() {
  const { state, loading, dataUnavailable, demoEnabled, buy, setToast, openWalletConnect } = useApp();
  const { d, t, n, ago, dir } = useI18n();
  const barRef = useRef<HTMLDivElement>(null);
  const lastSold = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tierCode, setTierCode] = useState("");
  const [tierRound, setTierRound] = useState<NonNullable<AppState["round"]> | null>(null);

  const tiers = state?.tiers ?? [];
  const defaultRound = state?.round;
  const activeTierCode = tierCode || defaultRound?.tierCode || tiers[0]?.code || "usd_1";
  const selectedTier = tiers.find((tier) => tier.code === activeTierCode);
  const round = activeTierCode === defaultRound?.tierCode ? defaultRound : tierRound;
  const sold = round?.sold ?? 0;
  const capacity = round?.capacity ?? selectedTier?.capacity ?? 1;
  const remaining = Math.max(0, capacity - sold);
  const ticketPrice = selectedTier?.priceUsd ?? state?.config.ticketPrice ?? 1;
  const displayPrize = round?.prize ?? selectedTier?.prize ?? state?.config.prizePerRound ?? 0;
  const maintenance = Boolean(state?.config?.maintenanceMode ?? state?.config?.maintenance);

  // stubs sold after first render get the flash animation (keyed remount)
  const [initialMaxId] = useState(() => (state?.round?.tickets ?? []).reduce((m, x) => Math.max(m, x.id), 0));

  // every real sale (anyone's) throws spinning gold dollars out of the progress bar
  useEffect(() => {
    const prev = lastSold.current;
    lastSold.current = sold;
    const bar = barRef.current;
    if (prev === null || sold <= prev || !bar) return;
    const r = bar.getBoundingClientRect();
    const frac = Math.min(1, sold / capacity);
    const x = dir === "rtl" ? r.right - r.width * frac : r.left + r.width * frac;
    burstDollars({ x, y: r.top + r.height / 2, count: Math.min(10, 3 + (sold - prev) * 2), power: 0.6 });
  }, [sold, capacity, dir]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!activeTierCode || activeTierCode === defaultRound?.tierCode) {
        setTierRound(defaultRound ?? null);
        return;
      }
      void (async () => {
        try {
          const res = await fetch(`/api/rounds/state?tierCode=${encodeURIComponent(activeTierCode)}`, { cache: "no-store" });
          const json = await res.json();
          if (res.ok && json.ok) setTierRound(json.round ?? null);
        } catch {
          setTierRound(null);
        }
      })();
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeTierCode, defaultRound]);

  const purchase = async (count: number, btn?: HTMLElement) => {
    if (maintenance) {
      setToast(d.errors.unavailable);
      return;
    }
    if (!round) {
      setToast(d.errors.noActiveRound);
      return;
    }
    if (!state?.user) {
      openWalletConnect();
      return;
    }
    const tickets = Math.min(count, remaining);
    if (tickets <= 0) return;
    const cost = tickets * ticketPrice;
    const goToWallet = () => {
      const wallet = document.getElementById("wallet");
      if (!wallet) return;
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#wallet`);
      wallet.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (Number(state.user.balance) < cost) {
      setToast(t(d.errors.insufficient, { n: tickets, cost: `$${money(cost)}` }));
      goToWallet();
      return;
    }
    const treasury = state.vault.adminWallet;
    const treasuryContribution = round.treasuryContribution === null
      ? "unverified"
      : `$${money(round.treasuryContribution)}`;
    if (!window.confirm(`${t(d.pool.tickets, { n: tickets })}\n${d.pool.purchaseBalance}\n${d.pool.price}: $${money(cost)}\n${d.pool.balance} $${money(state.user.balance)}\n${d.pool.treasuryAddress} (${treasuryContribution}): ${treasury}`)) {
      return;
    }
    setBusy(true);
    let res;
    try {
      res = await buy(count, activeTierCode);
    } finally {
      setBusy(false);
    }
    if (res === "insufficient") {
      goToWallet();
      return;
    }
    if (res === true) burstFrom(btn, { count: 4 + count, power: 0.75 });
  };

  const mine = round?.tickets.filter((x) => x.mine).length ?? 0;
  const pct = (k: number) => `${Math.round((Math.min(k, capacity) / capacity) * 100)}%`;
  const activity = state?.activity ?? [];

  if (!state || !round) {
    const message = dataUnavailable
      ? d.errors.unavailable
      : loading
        ? d.vaultChart.loading
        : demoEnabled && !state
          ? d.wc.demoBadge
          : d.errors.noActiveRound;
    return (
      <section id="pool" className="relative px-4 py-14 sm:px-6 lg:py-20">
        <div className="panel mx-auto max-w-[1240px] rounded-2xl px-6 py-10 text-center text-sm text-mint" role={dataUnavailable ? "alert" : "status"}>
          {message}
        </div>
      </section>
    );
  }

  const stubs = Array.from({ length: capacity }, (_, i) => {
    const t = round?.tickets[i];
    return { index: i + 1, ticket: t ?? null };
  });

  return (
    <section id="pool" className="relative">
      <div className="h-px w-full bg-[linear-gradient(90deg,transparent,rgba(233,196,106,0.55),transparent)]" />
      <div className="relative overflow-hidden bg-[#08120f]">
        <div className="guilloche pointer-events-none absolute inset-0 opacity-70" />
        <div className="grain absolute inset-0" />
        <GoldDollars3D count={18} seed={21} side="both" className="opacity-90" />

        <div className="relative mx-auto max-w-[1240px] px-4 py-14 sm:px-6 lg:py-20">
          {tiers.length > 1 ? (
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="micro text-foil">{d.tiers.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tiers.map((tier) => (
                    <button
                      key={tier.code}
                      onClick={() => setTierCode(tier.code)}
                      className={`focus-ring rounded-full border px-4 py-2 text-xs font-bold transition ${
                        tier.code === activeTierCode
                          ? "border-neon bg-neon/10 text-neon-2"
                          : "border-rule text-mint hover:border-mint/50"
                      }`}
                    >
                      {tier.name} · ${money(tier.priceUsd)}
                      {tier.code === round?.tierCode ? ` · ${d.tiers.current}` : ""}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-mint">{d.tiers.select}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <p className="micro flex flex-wrap items-center gap-2 text-foil">
                <span>
                  ROUND {String(round.id).padStart(2, "0")} · POOL {sold}/
                  {capacity}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/[0.08] px-2.5 py-1 text-neon-2">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-neon-2" />
                  {d.pool.autoDraw}
                </span>
              </p>
              <h2 className="mt-4 text-[clamp(2.1rem,5.4vw,3.9rem)] font-black leading-[1.08] text-white">
                {d.pool.titleBefore} <span className="neon-text font-display tnum">{n(remaining)}</span>{" "}
                {d.pool.titleAfter}
              </h2>
              <p className="mt-4 max-w-[58ch] text-[15px] leading-8 text-mint">
                {t(d.pool.body, { prize: `$${money(displayPrize)}` })}
              </p>
            </div>

            <div className="flex items-end gap-6">
              <div>
                <p className="micro text-mint">{d.pool.prize}</p>
                <p
                  dir="ltr"
                  className="font-display tnum text-[clamp(2.4rem,6vw,3.6rem)] font-bold leading-none text-white"
                >
                  ${money(displayPrize)}
                </p>
              </div>
              <div className="hidden h-14 w-px bg-rule sm:block" />
              <div>
                <p className="micro text-mint">{d.pool.price}</p>
                <p
                  dir="ltr"
                  className="font-display tnum text-[clamp(2.4rem,6vw,3.6rem)] font-bold leading-none text-foil"
                >
                  ${money(ticketPrice)}
                </p>
              </div>
            </div>
          </div>

          {selectedTier ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                [d.tiers.price, `$${money(selectedTier.priceUsd)}`],
                [d.tiers.capacity, n(selectedTier.capacity)],
                [d.tiers.prize, `$${money(selectedTier.prize)}`],
                [d.tiers.treasury, `$${money(selectedTier.treasury)}`],
                [d.tiers.admin, `$${money(selectedTier.admin)}`],
                [
                  d.tiers.duration,
                  selectedTier.maximumParticipants === null
                    ? t(d.tiers.anyPlayers, { n: n(selectedTier.minimumParticipants) })
                    : t(d.tiers.players, { min: n(selectedTier.minimumParticipants), max: n(selectedTier.maximumParticipants) }),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-rule bg-black/20 px-4 py-3">
                  <p className="micro text-mint">{label}</p>
                  <p dir="ltr" className="mt-1 font-display tnum text-sm text-white">{value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* ————— the signature: 20 perforated stubs ————— */}
          <div className="mt-12 grid grid-cols-4 gap-2.5 sm:grid-cols-5 lg:grid-cols-10">
            {stubs.map(({ index, ticket }) => {
              const filled = Boolean(ticket);
              return (
                <motion.div
                  key={ticket ? `t${ticket.id}` : `e${index}`}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: Math.min(index * 0.022, 0.5) }}
                  role={!filled ? "button" : undefined}
                  tabIndex={!filled ? 0 : undefined}
                  aria-label={!filled ? `${d.pool.open} ${n(index)}` : undefined}
                  onClick={!filled ? (e) => void purchase(1, e.currentTarget) : undefined}
                  onKeyDown={
                    !filled
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void purchase(1, e.currentTarget);
                          }
                        }
                      : undefined
                  }
                  className={`perf relative flex h-[104px] flex-col justify-between overflow-hidden rounded-[10px] px-2.5 py-2.5 ${
                    filled
                      ? "stub-fill text-[#161206]"
                      : `cursor-pointer border border-dashed border-rule bg-white/[0.02] text-mint transition-colors hover:border-neon/60 hover:bg-neon/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${index === sold + 1 ? "stub-next" : ""}`
                  } ${ticket && ticket.id > initialMaxId ? "flash" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      dir="ltr"
                      className={`font-display text-[9px] tracking-[0.18em] ${
                        filled ? "text-[#4a3a12]" : "text-mint/60"
                      }`}
                    >
                      {String(index).padStart(2, "0")}
                    </span>
                    {ticket?.mine ? (
                      <span className="rounded-full bg-[#161206] px-1.5 py-0.5 text-[8px] font-bold text-foil">
                        {d.pool.you}
                      </span>
                    ) : null}
                  </div>

                  {filled ? (
                    <>
                      <p
                        dir="ltr"
                        className="font-display truncate text-[10px] font-bold tracking-[0.08em]"
                      >
                        {ticket?.serial}
                      </p>
                      <p dir="ltr" className="truncate text-[10px] text-[#4a3a12]">
                        @{ticket?.username}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] leading-4 text-mint/70">{d.pool.empty}</p>
                      <p
                        dir="ltr"
                        className="font-display text-[11px] tracking-[0.14em] text-neon-2/80"
                      >
                        {d.pool.open}
                      </p>
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* progress + urgency */}
          <div className="mt-8">
            <div ref={barRef} className="h-3 w-full overflow-hidden rounded-full border border-rule bg-black/40">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,#0b6b48,#10e28e_45%,#e9c46a)]"
                initial={{ width: 0 }}
                whileInView={{ width: `${(sold / capacity) * 100}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div
              dir="ltr"
              className="mt-3 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="micro text-mint">
                {sold} TICKETS SOLD · {remaining} LEFT
                {round?.seedHash ? (
                  <span className="ms-3 normal-case tracking-normal text-mint/60" title="SHA-256 commitment of this round's server seed">
                    · {d.pool.fairHash} {round.seedHash.slice(0, 16)}…
                  </span>
                ) : null}
              </p>
              <p dir="auto" className="flex items-center gap-2 text-[13px] text-foil">
                <span className="live-dot h-2 w-2 rounded-full bg-foil" />
                {remaining <= 5 ? d.pool.hot : d.pool.cool}
              </p>
            </div>
          </div>

          {/* honest odds — informed choice instead of pressure */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rule bg-black/25 px-5 py-4">
            <div className="flex items-center gap-4">
              <span dir="ltr" className="font-display tnum text-3xl font-bold text-foil">{n(mine)}</span>
              <div>
                <p className="micro text-mint">{d.pool.yourTickets}</p>
                <p className="mt-1 text-sm text-white">
                  {mine > 0 ? t(d.pool.yourChance, { n: n(mine), p: pct(mine) }) : d.pool.noTickets}
                </p>
              </div>
            </div>
            <p className="text-[12px] text-mint">{d.pool.perTicket}</p>
          </div>

          {/* buy controls */}
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="panel rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="micro text-neon-2">{d.pool.boostKicker}</p>
                  <h3 className="mt-2 text-xl font-black text-white">{d.pool.boostTitle}</h3>
                  <p className="mt-2 text-sm leading-7 text-mint">
                    {d.pool.boostBody}{" "}
                    {state?.user ? (
                      <span className="text-white">
                        {d.pool.balance}{" "}
                        <span dir="ltr" className="font-display tnum text-neon-2">
                          ${money(state.user.balance)}
                        </span>
                      </span>
                    ) : null}{" "}
                    <a href="#wallet" className="text-foil underline-offset-4 hover:underline">
                      {d.pool.topUp}
                    </a>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {[1, 3, 5].map((c) => (
                    <button
                      key={c}
                      disabled={busy || remaining === 0 || maintenance}
                      onClick={(e) => purchase(c, e.currentTarget)}
                      className={`focus-ring rounded-2xl px-6 py-4 font-bold disabled:opacity-50 ${
                        c === 3 ? "btn-foil" : "btn-neon"
                      }`}
                    >
                      <span dir="ltr" className="font-display tnum">
                        {c} × ${money(state.config.ticketPrice)}
                      </span>
                      <span className="block text-[11px] font-medium opacity-80">
                        {t(d.pool.tickets, { n: n(c) })}
                      </span>
                      {state?.user ? (
                        <span dir="ltr" className="block text-[10px] font-medium opacity-70">
                          {t(d.pool.after, { n: c, p: pct(mine + Math.min(c, remaining)) })}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-foil/25 bg-foil/[0.07] p-6">
              <p className="micro text-foil">{d.pool.moneyKicker}</p>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-mint">
                {[d.pool.money1, d.pool.money2, d.pool.money3].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <span className="text-foil">◆</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setToast(
                    state?.config.live ? d.pool.transparencyLive : d.pool.transparencyDemo,
                  )
                }
                className="focus-ring mt-5 w-full rounded-xl border border-foil/30 px-5 py-3 text-xs text-foil transition-colors hover:bg-foil/10"
              >
                {d.pool.transparency}
              </button>
            </div>
          </div>

          {/* live activity — real ledger rows only, usernames masked */}
          <div className="mt-6 overflow-hidden rounded-2xl border border-rule bg-black/20">
            <p className="micro flex items-center gap-2 border-b border-rule px-5 py-3 text-mint">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-neon-2" /> {d.activity.kicker}
            </p>
            {activity.length === 0 ? (
              <p className="px-5 py-4 text-sm text-mint">{d.activity.empty}</p>
            ) : (
              <ul className="grid gap-px bg-rule/40 sm:grid-cols-2">
                {activity.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 bg-[#08120f] px-5 py-3 text-[13px]">
                    <span className={a.type === "prize" ? "text-foil" : "text-mint"}>
                      {a.type === "prize"
                        ? t(d.activity.won, { user: a.user, amount: `$${money(a.amount)}` })
                        : t(d.activity.bought, { user: a.user, n: n(a.amount) })}
                    </span>
                    <span className="shrink-0 text-[11px] text-mint/60" suppressHydrationWarning>{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="h-px w-full bg-[linear-gradient(90deg,transparent,rgba(233,196,106,0.55),transparent)]" />
    </section>
  );
}
