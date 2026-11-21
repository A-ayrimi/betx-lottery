"use client";

import { useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { Logo, Mark } from "./Logo";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";

const subscribeToLocation = () => () => {};
const getLocationOrigin = () => window.location.origin;
const getServerLocationOrigin = () => "";

function TicketArtwork({ className = "", label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 1400 900"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path fill="#09130f" d="M0 0h1400v900H0z" />
      <circle cx="1020" cy="390" r="430" fill="#e9c46a" fillOpacity=".08" />
      <g transform="rotate(-12 930 450)">
        <rect x="650" y="260" width="560" height="360" rx="32" fill="#000" fillOpacity=".4" />
        <rect x="630" y="230" width="560" height="360" rx="32" fill="#e9c46a" />
        <path d="M660 270h500v280H660z" fill="none" stroke="#573d14" strokeOpacity=".55" strokeWidth="3" strokeDasharray="10 12" />
        <circle cx="630" cy="410" r="30" fill="#0b1512" />
        <circle cx="1190" cy="410" r="30" fill="#0b1512" />
        <path d="M910 230v360" stroke="#573d14" strokeOpacity=".55" strokeWidth="3" strokeDasharray="10 12" />
        <path d="M800 390c0-45 33-74 80-78v-45h48v45c43 6 69 34 71 76h-53c-3-19-13-31-40-31-25 0-40 12-40 28 0 16 15 26 52 36 49 13 83 33 83 77 0 40-28 68-73 77v45h-48v-44c-49-7-80-37-83-82h53c4 22 21 36 48 36s45-12 45-30c0-18-15-28-55-39-51-14-88-33-88-71Z" fill="#1b170d" />
        <path d="M688 300h168M688 520h168" stroke="#573d14" strokeOpacity=".32" strokeWidth="5" />
        <circle cx="720" cy="410" r="8" fill="#10e28e" />
        <circle cx="1120" cy="410" r="8" fill="#10e28e" />
      </g>
      <g fill="#e9c46a" fillOpacity=".5">
        <circle cx="310" cy="220" r="6" />
        <circle cx="400" cy="650" r="9" />
        <circle cx="1210" cy="170" r="5" />
      </g>
      <path fill="#060a09" fillOpacity=".22" d="M0 0h1400v900H0z" />
    </svg>
  );
}

/* ------------------------------------------------------------ winners tape */

export function WinnersTicker() {
  const { state, loading, dataUnavailable } = useApp();
  const { d } = useI18n();
  const rows = state?.winners ?? [];
  if (rows.length === 0) {
    return (
      <div role={dataUnavailable ? "alert" : "status"} className="border-y border-rule bg-[#07110e] px-4 py-4 text-center text-sm text-mint">
        {dataUnavailable ? d.errors.unavailable : loading ? d.vaultChart.loading : d.board.noDraws}
      </div>
    );
  }

  return (
    <div dir="ltr" className="relative overflow-hidden border-y border-rule bg-[#07110e] py-4">
      <div className="grain absolute inset-0" />
      <div className="relative flex flex-wrap justify-center gap-x-10 gap-y-3">
        {rows.map((w) => (
          <span key={w.roundId} className="flex items-center gap-3 text-sm">
            <span className="text-foil">◆</span>
            <span className="text-mint">WINNER</span>
            <span className="text-white">{w.winnerName}</span>
            <span className="font-display text-[11px] tracking-[0.18em] text-neon-2">{w.winningSerial}</span>
            <span className="font-display tnum font-bold text-foil">+${money(w.prize)}</span>
            <span className="text-mint/50">|</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ prizes */

export function Prizes() {
  const { d } = useI18n();
  const tones = ["gold", "neon", "plain", "plain"];
  return (
    <section id="prizes" className="relative py-20 lg:py-28">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end [&>*]:min-w-0">
          <div>
            <p className="micro text-foil">{d.prizes.kicker}</p>
            <h2 className="mt-4 text-[clamp(2.1rem,5vw,3.5rem)] font-black leading-[1.1] text-white">
              {d.prizes.title1}
              <br />
              <span className="neon-text">{d.prizes.titleNeon}</span>
            </h2>
            <p className="mt-5 max-w-[46ch] text-[15px] leading-8 text-mint">{d.prizes.body}</p>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <div>
                <p className="micro text-mint">{d.hero.treasuryAllocation}</p>
                <p dir="ltr" className="font-display tnum text-start text-[clamp(2.4rem,6vw,4rem)] font-bold leading-none text-foil">
                  15%
                </p>
              </div>
              <div>
                <p className="micro text-mint">{d.hero.adminEarnings}</p>
                <p dir="ltr" className="font-display tnum text-start text-[clamp(2.4rem,6vw,4rem)] font-bold leading-none text-foil">
                  10%
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-neon/25 bg-neon/[0.06] px-5 py-4">
              <p dir="ltr" className="font-display tnum text-3xl font-bold text-neon-2">75%</p>
              <div>
                <p className="micro text-neon-2">{d.prizes.rtp}</p>
                <p className="mt-1 text-[13px] leading-6 text-mint">{d.prizes.rtpNote}</p>
              </div>
            </div>
          </div>

          <div className="panel overflow-x-auto rounded-2xl">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1.4fr_1fr_1.3fr_1fr] gap-3 border-b border-rule px-6 py-4">
                {d.prizes.headers.map((h) => (
                  <p key={h} className="micro text-mint">{h}</p>
                ))}
              </div>
              {d.prizes.rows.map((r, i) => (
                <motion.div
                  key={r.name}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.45 }}
                  className="grid grid-cols-[1.4fr_1fr_1.3fr_1fr] items-center gap-3 border-b border-rule/60 px-6 py-5 transition-colors last:border-b-0 hover:bg-white/[0.03]"
                >
                  <p className="text-[14px] font-bold text-white">{r.name}</p>
                  <p
                    dir="ltr"
                    className={`font-display tnum text-start text-[15px] font-bold ${
                      tones[i] === "gold" ? "text-foil" : tones[i] === "neon" ? "text-neon-2" : "text-white"
                    }`}
                  >
                    {r.amount}
                  </p>
                  <p className="text-[13px] leading-6 text-mint">{r.how}</p>
                  <p className="text-[12px] text-mint/80">{r.when}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- how it works */

export function HowItWorks() {
  const { d } = useI18n();
  return (
    <section className="relative overflow-hidden py-20 lg:py-28">
      <div className="absolute inset-0 opacity-[0.16]">
        <TicketArtwork className="h-full w-full" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#060a09,rgba(6,10,9,0.55),#060a09)]" />
      </div>
      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
        <p className="micro text-neon-2">{d.how.kicker}</p>
        <h2 className="mt-4 max-w-[22ch] text-[clamp(2.1rem,5vw,3.5rem)] font-black leading-[1.12] text-white">
          {d.how.title1}
          <span className="gold-text">{d.how.titleGold}</span>
        </h2>
        <div className="mt-14 space-y-8">
          {d.how.steps.map((s, i) => (
            <motion.div
              key={s.t}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className={`flex flex-col gap-6 border-s-2 border-foil/40 ps-7 sm:flex-row sm:items-start ${
                i === 1 ? "sm:ms-[7%]" : i === 2 ? "sm:ms-[14%]" : ""
              }`}
            >
              <p dir="ltr" className="font-display tnum text-[clamp(2.6rem,7vw,4.4rem)] font-bold leading-none text-foil/80">
                {String(i + 1).padStart(2, "0")}
              </p>
              <div>
                <h3 className="text-2xl font-black text-white">{s.t}</h3>
                <p className="mt-3 max-w-[62ch] text-[15px] leading-9 text-mint">{s.d}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- leaderboard */

export function Leaderboard() {
  const { state, loading, dataUnavailable } = useApp();
  const { d, ago, href, n } = useI18n();
  const rows = state?.leaderboard ?? [];
  const winners = state?.winners ?? [];

  return (
    <section className="relative py-16 lg:py-24">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 sm:px-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="min-w-0">
          <p className="micro text-foil">{d.board.topKicker}</p>
          <h2 className="mt-4 text-[clamp(1.9rem,4.4vw,2.9rem)] font-black leading-[1.15] text-white">{d.board.topTitle}</h2>
          <div className="panel mt-8 overflow-hidden rounded-2xl">
            <div className="grid grid-cols-[42px_minmax(0,1fr)_72px_96px] gap-3 border-b border-rule px-5 py-3.5">
              {d.board.headers.map((h) => (
                <p key={h} className="micro text-mint">{h}</p>
              ))}
            </div>
            {rows.map((r, i) => (
              <div key={r.username} className="grid grid-cols-[42px_minmax(0,1fr)_72px_96px] items-center gap-3 border-b border-rule/50 px-5 py-4 last:border-b-0 hover:bg-white/[0.03]">
                <span dir="ltr" className={`font-display tnum text-start text-sm font-bold ${i === 0 ? "text-foil" : "text-mint/70"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate text-[14px] text-white">{r.displayName}</span>
                <span className="font-display tnum text-[13px] text-neon-2">{n(r.tickets)}</span>
                <span dir="ltr" className="font-display tnum text-start text-[13px] text-white">${money(r.won)}</span>
              </div>
            ))}
            {rows.length === 0 ? (
              <p role={dataUnavailable ? "alert" : "status"} className="px-5 py-8 text-center text-sm text-mint">
                {dataUnavailable ? d.errors.unavailable : loading ? d.vaultChart.loading : d.board.empty}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0">
          <p className="micro text-neon-2">{d.board.recentKicker}</p>
          <h2 className="mt-4 text-[clamp(1.9rem,4.4vw,2.9rem)] font-black leading-[1.15] text-white">{d.board.recentTitle}</h2>
          <div className="mt-8 space-y-3">
            {winners.slice(0, 5).map((w) => (
              <div key={w.roundId} className="flex items-center justify-between gap-4 rounded-2xl border border-rule bg-white/[0.02] px-5 py-4">
                <div className="flex items-center gap-3">
                  <Mark className="h-8 w-8 text-foil/80" />
                  <div>
                    <p className="text-[14px] font-bold text-white">{w.winnerName}</p>
                    <p dir="ltr" className="font-display text-start text-[10px] tracking-[0.18em] text-neon-2">{w.winningSerial}</p>
                  </div>
                </div>
                <div className="text-end">
                  <p dir="ltr" className="font-display tnum text-lg font-bold text-foil">+${money(w.prize)}</p>
                  <p className="text-[11px] text-mint/70" suppressHydrationWarning>{ago(w.drawnAt)}</p>
                  <a href={href("/verify")} className="text-[11px] text-neon-2/80 underline-offset-4 hover:underline">
                    {d.board.verify}
                  </a>
                </div>
              </div>
            ))}
            {winners.length === 0 ? (
              <p role={dataUnavailable ? "alert" : "status"} className="rounded-2xl border border-rule px-5 py-8 text-center text-sm text-mint">
                {dataUnavailable ? d.errors.unavailable : loading ? d.vaultChart.loading : d.board.noDraws}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- invite */

export function Invite() {
  const { state, setToast } = useApp();
  const { d, t } = useI18n();
  const code = state?.user?.referralCode ?? null;
  const bot = state?.config.botUsername;
  const origin = useSyncExternalStore(subscribeToLocation, getLocationOrigin, getServerLocationOrigin);
  const full = code ? (bot ? `https://t.me/${bot}?start=ref_${code}` : `${origin}/?ref=${code}`) : "";
  const link = code ? full.replace(/^https?:\/\//, "") : d.invite.loginForLink;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return setToast(d.invite.needLogin);
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setToast(d.invite.copiedToast);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setToast(d.invite.copyFail);
    }
  };

  return (
    <section id="invite" className="relative py-20 lg:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="panel grain relative overflow-hidden rounded-[28px]">
          <div className="guilloche pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative grid gap-10 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-12 [&>*]:min-w-0">
            <div>
              <p className="micro text-foil">{d.invite.kicker}</p>
              <h2 className="mt-4 text-[clamp(2rem,4.6vw,3.2rem)] font-black leading-[1.12] text-white">
                {d.invite.title1}
                <br />
                <span className="gold-text">{d.invite.titleGold}</span>
              </h2>
              <p className="mt-5 max-w-[52ch] text-[15px] leading-9 text-mint">
                {t(d.invite.body, { bonus: `$${money(state?.config.referralDepositBonus ?? 0.5)}` })}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <div dir="ltr" className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-rule bg-black/35 px-5 py-4">
                  <p className="micro text-mint">{d.invite.linkLabel}</p>
                  <p className="font-display mt-1.5 truncate text-[15px] tracking-[0.04em] text-neon-2">{link}</p>
                </div>
                <button onClick={copy} className="btn-neon focus-ring rounded-2xl px-7 py-4 text-base font-bold">
                  {copied ? d.invite.copied : d.invite.copy}
                </button>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4">
                {d.invite.stats.map((s) => (
                  <div key={s.l} className="rounded-2xl border border-rule bg-white/[0.03] px-4 py-4">
                    <p dir="ltr" className="font-display tnum text-start text-2xl font-bold text-white">{s.v}</p>
                    <p className="mt-1 text-[11px] leading-5 text-mint">{s.l}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-foil/25">
              <TicketArtwork className="absolute inset-0 h-full w-full" label={d.invite.ticketAlt} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,9,0.15),rgba(6,10,9,0.88))]" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="micro text-foil">GOLDEN TICKET · $1</p>
                <p className="mt-2 text-xl font-black leading-8 text-white">{d.invite.quote}</p>
                <p dir="ltr" className="font-display mt-2 text-start text-[11px] tracking-[0.24em] text-neon-2">
                  SMALL ENTRY. MASSIVE JACKPOT.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- faq */

export function Faq() {
  const { d } = useI18n();
  return (
    <section id="faq" className="relative py-20 lg:py-24">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] [&>*]:min-w-0">
        <div>
          <p className="micro text-neon-2">{d.faq.kicker}</p>
          <h2 className="mt-4 text-[clamp(1.9rem,4.4vw,3rem)] font-black leading-[1.15] text-white">{d.faq.title}</h2>
          <p className="mt-5 max-w-[38ch] text-[15px] leading-8 text-mint">{d.faq.body}</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {["Play Smart. Win Instant.", "Pure Luck. Zero Delays.", "Your Ticket to Instant USDC."].map((s) => (
              <span key={s} dir="ltr" className="micro rounded-full border border-rule px-3.5 py-2 text-mint">{s}</span>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {d.faq.items.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-rule bg-white/[0.02] px-6 py-5 transition-colors hover:border-mint/30">
              <summary className="flex items-center justify-between gap-4">
                <span className="text-[15px] font-bold text-white">{f.q}</span>
                <span className="faq-plus shrink-0 text-2xl leading-none text-foil transition-transform duration-300">+</span>
              </summary>
              <p className="mt-4 text-[14px] leading-8 text-mint">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- footer */

export function SiteFooter() {
  const { state, dataUnavailable, demoEnabled } = useApp();
  const { d, t, n, href } = useI18n();
  const cfg = state?.config;
  return (
    <footer className="relative overflow-hidden border-t border-rule bg-[#07110e]">
      <div className="guilloche pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span dir="ltr" className="inline-block">
              <Logo />
            </span>
            <p className="mt-6 max-w-[42ch] text-[15px] leading-8 text-mint">{d.footer.about}</p>
            <a
              href={href("/install")}
              className="btn-neon focus-ring mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v2.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V17" />
              </svg>
              {d.pwa.pwaInstall}
            </a>
            <p className="mt-2 text-[11px] text-mint/60">{d.pwa.platforms}</p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {d.footer.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-rule px-3.5 py-1.5 text-[12px] text-mint">{tag}</span>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span dir="ltr" className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-foil/70 font-display text-sm font-bold text-foil">
                18+
              </span>
              <p className="max-w-[36ch] text-[12px] leading-6 text-mint/80">
                {d.footer.help}{" "}
                <a href={cfg?.helpUrl ?? "https://www.begambleaware.org"} target="_blank" rel="noopener noreferrer" className="text-neon-2 hover:underline">
                  {(cfg?.helpUrl ?? "https://www.begambleaware.org").replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 [&>*]:min-w-0">
            <div>
              <p className="micro text-foil">{d.footer.product}</p>
              <ul className="mt-4 space-y-3 text-[13px] text-mint">
                <li><a className="hover:text-white" href="#pool">{d.footer.pool}</a></li>
                <li><a className="hover:text-white" href="#wheel">{d.footer.wheel}</a></li>
                <li><a className="hover:text-white" href="#prizes">{d.footer.prizes}</a></li>
                <li><a className="hover:text-white" href="#invite">{d.footer.invite}</a></li>
                <li><a className="hover:text-white" href="#faq">{d.footer.faq}</a></li>
              </ul>
            </div>
            <div>
              <p className="micro text-foil">{d.footer.legal}</p>
              <ul className="mt-4 space-y-3 text-[13px] text-mint">
                <li><a className="hover:text-white" href={href("/verify")}>{d.board.historyTitle}</a></li>
                <li><a className="hover:text-white" href={href("/install")}>{d.pwa.pwaMenu}</a></li>
                <li><a className="hover:text-white" href={href("/terms")}>{d.footer.terms}</a></li>
                <li><a className="hover:text-white" href={href("/privacy")}>{d.footer.privacy}</a></li>
                <li><a className="hover:text-white" href={href("/responsible-gaming")}>{d.footer.responsible}</a></li>
                {cfg?.supportEmail ? (
                  <li><a dir="ltr" className="hover:text-white" href={`mailto:${cfg.supportEmail}`}>{cfg.supportEmail}</a></li>
                ) : null}
              </ul>
            </div>
            <div>
              <p className="micro text-foil">{d.footer.vault}</p>
              <p dir="ltr" className="font-display tnum mt-4 text-start text-2xl font-bold text-white">
                {state ? `$${money(state.vault.balance)}` : "—"}
              </p>
              <p className="mt-1 text-[12px] text-mint">
                {state
                  ? t(d.footer.vaultNote, { n: n(state.vault.roundsCompleted) })
                  : dataUnavailable
                    ? d.errors.unavailable
                    : demoEnabled
                      ? d.wc.demoBadge
                      : d.errors.unavailable}
              </p>
            </div>
          </div>
        </div>

        <div className="rule-x mt-12" />
        <div className="mt-8 flex flex-col items-start justify-between gap-4 text-[12px] leading-6 text-mint/70 sm:flex-row sm:items-center">
          <div>
            <p>
              © {new Date().getFullYear()} {cfg?.company ?? "BETX"} — {d.footer.rights} {cfg?.live ? d.footer.live : d.footer.demo}
            </p>
            {cfg?.license ? <p dir="ltr" className="mt-1 text-start">{cfg.license}</p> : null}
          </div>
          <p dir="ltr" className="font-display tracking-[0.22em]">PURE LUCK. ZERO DELAYS.</p>
        </div>
      </div>
    </footer>
  );
}
