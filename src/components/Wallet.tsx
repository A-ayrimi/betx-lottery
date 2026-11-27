"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { usd } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { BalanceBadge } from "./BalanceBadge";
import { DepositCard } from "./DepositCard";
import { TicketSerialRow } from "./TicketDetails";


export function Wallet() {
  const { state, withdraw, setToast, isDemoSession, loading, dataUnavailable, demoEnabled } = useApp();
  const { d, t, n, ago, date, locale } = useI18n();
  const [busy, setBusy] = useState<"dep" | "wd" | null>(null);
  const [wd, setWd] = useState({ amount: "", address: "" });

  const user = state?.user;
  const cfg = state?.config;
  const live = Boolean(cfg?.live);
  const maintenance = Boolean(cfg?.maintenanceMode ?? cfg?.maintenance);
  const bodyText = maintenance ? d.ui.maintenanceBanner : live ? d.wallet.bodyLive : d.wallet.bodyDemo;
  const statusBadge = maintenance ? d.ui.statusMaintenance : live ? null : d.wallet.demoBadge;
  const excluded = user?.selfExcludedUntil ?? null;
  const statusLabel = (s: string) => (d.wallet.status as Record<string, string>)[s] ?? s;

  const onWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dataUnavailable) return setToast(d.errors.unavailable);
    if (!user) return setToast(d.errors.notLoggedIn);
    setBusy("wd");
    const ok = await withdraw(Number(wd.amount), wd.address.trim());
    setBusy(null);
    if (ok) setWd({ amount: "", address: "" });
  };

  return (
    <section id="wallet" className="relative scroll-mt-24 py-20 lg:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="micro text-neon-2">{d.wallet.kicker}</p>
            <h2 className="mt-4 text-[clamp(2rem,4.8vw,3.3rem)] font-black leading-[1.12] text-white">
              {d.wallet.title1}
              <span className="gold-text">{d.wallet.titleGold}</span>
            </h2>
            <p className="mt-4 max-w-[60ch] text-[15px] leading-8 text-mint">{bodyText}</p>
          </div>
          {statusBadge ? (
            <span dir="ltr" className="micro rounded-full border border-foil/40 bg-foil/10 px-4 py-2 text-foil">
              {statusBadge}
            </span>
          ) : null}
        </div>

        {excluded ? (
          <p className="mt-6 rounded-xl border border-foil/40 bg-foil/10 px-5 py-3 text-sm text-foil">
            {t(d.rg.excludedUntil, { date: date(excluded) })}
          </p>
        ) : null}

        <div className="mt-10 grid gap-4 lg:grid-cols-[0.8fr_1.1fr_1.1fr] [&>*]:min-w-0">
          <div className="panel grain relative overflow-hidden rounded-2xl p-6">
            <div className="guilloche pointer-events-none absolute inset-0 opacity-60" />
            <div className="relative">
              <p className="micro flex flex-wrap items-center gap-2 text-mint">
                {d.wallet.balance}
                <BalanceBadge kind={demoEnabled || isDemoSession ? "demo" : "ledger"} />
              </p>
              <p dir="ltr" className="font-display tnum mt-3 text-start text-5xl font-bold text-white">
                {user ? `${usd(user.balance, locale)}` : "—"}
              </p>
              <p className="mt-2 text-sm text-mint">
                {user
                  ? t(d.wallet.equiv, { n: n(Math.floor(user.balance)) })
                  : state
                    ? d.wallet.loginToSee
                    : dataUnavailable
                      ? d.errors.unavailable
                      : loading
                        ? d.vaultChart.loading
                        : demoEnabled
                          ? d.wc.demoBadge
                          : d.errors.unavailable}
              </p>
              <div className="rule-x my-6" />
              <div className="space-y-2 text-[13px] text-mint">
                <p className="flex justify-between gap-3">
                  <span>{d.wallet.totalDeposited}</span>
                  <span dir="ltr" className="font-display tnum text-white">{user ? `${usd(user.totalDeposited, locale)}` : "—"}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span>{d.wallet.bonusSpins}</span>
                  <span className="font-display tnum text-foil">{user ? n(user.bonusSpins) : "—"}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span>{d.wallet.telegram}</span>
                  <span className={user?.telegramLinked ? "text-neon-2" : "text-mint/60"}>
                    {user ? user.telegramLinked ? d.wallet.linked : d.wallet.notLinked : "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <DepositCard />

          <form onSubmit={onWithdraw} className="panel rounded-2xl p-6">
            <p className="micro text-foil">{d.wallet.withdrawKicker}</p>
            <h3 className="mt-2 text-xl font-black text-white">{d.wallet.withdrawTitle}</h3>
            <label className="mt-5 block">
              <span className="micro text-mint">{t(d.wallet.amountMin, { min: `${usd(cfg?.minWithdraw ?? 5, locale)}` })}</span>
              <input
                dir={locale === "fa" ? "rtl" : "ltr"}
                inputMode="decimal"
                value={wd.amount}
                onChange={(e) => setWd({ ...wd, amount: e.target.value.replace(/[^0-9.]/g, "") })}
                placeholder={locale === "fa" ? usd(15, locale) : "15.00"}
                className="focus-ring mt-2 w-full rounded-xl border border-rule bg-black/30 px-4 py-3 font-display text-sm text-white placeholder:text-mint/40"
              />
            </label>
            <label className="mt-3 block">
              <span className="flex items-center justify-between gap-2">
                <span className="micro text-mint">{d.wallet.address}</span>
                {user?.walletAddress ? (
                  <button
                    type="button"
                    onClick={() => setWd({ ...wd, address: user.walletAddress ?? "" })}
                    className="rounded-full border border-neon/30 px-2.5 py-0.5 text-[11px] text-neon-2 hover:bg-neon/10"
                  >
                    {d.wc.sendToMine}
                  </button>
                ) : null}
              </span>
              <input
                dir="ltr"
                value={wd.address}
                onChange={(e) => setWd({ ...wd, address: e.target.value })}
                placeholder={user?.payoutAddress || d.wallet.address}
                className="focus-ring mt-2 w-full rounded-xl border border-rule bg-black/30 px-4 py-3 font-display text-[13px] text-white placeholder:text-mint/40"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || dataUnavailable || maintenance}
              className="btn-foil focus-ring mt-5 w-full rounded-xl px-6 py-3.5 text-base font-bold disabled:opacity-60"
            >
              {busy === "wd" ? d.wallet.submitting : d.wallet.submit}
            </button>
            <p className="mt-3 text-[12px] leading-6 text-mint/80">{isDemoSession ? d.wc.demoWalletNote : d.wallet.wdHint}</p>
          </form>
        </div>

        {user && user.tickets.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="panel mt-4 overflow-hidden rounded-2xl"
          >
            <p className="micro border-b border-rule px-6 py-4 text-mint">{d.wallet.ticketCards}</p>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {user.tickets.map((ticket) => (
                <article key={ticket.id} className="rounded-xl border border-foil/25 bg-foil/[0.05] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[11px] font-bold ${ticket.status === "winner" ? "text-neon-2" : ticket.status === "pending" ? "text-foil" : "text-mint"}`}>
                      {ticket.status === "winner"
                        ? d.wallet.ticketWon
                        : ticket.status === "pending"
                          ? d.wallet.ticketPending
                          : ticket.status === "refunded"
                            ? d.wallet.ticketRefunded
                            : d.wallet.ticketLost}
                    </span>
                    {ticket.status === "winner" ? <span dir="ltr" className="font-display text-sm text-foil">{usd(ticket.prize, locale)}</span> : null}
                  </div>
                  <div className="mt-3">
                    <TicketSerialRow
                      ticket={{
                        serial: ticket.serial,
                        roundId: ticket.roundId,
                        status: ticket.status,
                        kind: ticket.kind,
                        createdAt: ticket.createdAt,
                        prize: ticket.prize,
                        walletAddress: ticket.walletAddress,
                        transactionReference: ticket.transactionReference,
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>
          </motion.div>
        ) : null}

        {user && (user.deposits.length > 0 || user.withdrawals.length > 0) ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="panel mt-4 overflow-hidden rounded-2xl"
          >
            <p className="micro border-b border-rule px-6 py-4 text-mint">{d.wallet.transactions}</p>
            {[
              ...user.deposits.map((x) => ({ key: `d${x.id}`, kind: d.wallet.deposit, amount: x.amount, status: x.status, at: x.createdAt, link: null, linkLabel: d.wc.viewTx, sign: "+" })),
              ...user.withdrawals.map((x) => ({
                key: `w${x.id}`,
                kind: d.wallet.withdrawal,
                amount: x.amount,
                status: x.status,
                at: x.createdAt,
               
                link: x.txHash ? `https://solscan.io/tx/${x.txHash}` : null,
                linkLabel: d.wc.viewTx,
                sign: "−",
              })),
              ...(isDemoSession
                ? (state?.activity ?? [])
                    .filter((x) => x.user === user.username)
                    .map((x) => {
                      const purchase = x.type === "ticket_buy";
                      return {
                        key: `demo${x.id}`,
                        kind: purchase ? d.wallet.demoTicketPurchase : d.wallet.demoPrize,
                        amount: x.amount,
                        status: d.wc.demoBadge,
                        at: x.at,
                        link: null,
                        linkLabel: "",
                        sign: purchase ? "−" : "+",
                      };
                    })
                : []),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((r) => (
                <div key={r.key} className="grid grid-cols-[96px_1fr_auto] items-center gap-4 border-b border-rule/50 px-6 py-3.5 text-[13px] last:border-b-0">
                  <span className="text-white">{r.kind}</span>
                  <span className="text-mint">
                    {statusLabel(r.status)} · <span>{ago(r.at)}</span>
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noopener noreferrer" className="ms-2 text-neon-2 underline-offset-4 hover:underline">
                        {r.linkLabel}
                      </a>
                    ) : null}
                  </span>
                  <span dir="ltr" className={`font-display tnum font-bold ${r.sign === "+" ? "text-neon-2" : "text-foil"}`}>
                    {r.sign}{usd(r.amount, locale)}
                  </span>
                </div>
              ))}
          </motion.div>
        ) : null}

        {user ? <ResponsiblePanel /> : null}
      </div>
    </section>
  );
}

function ResponsiblePanel() {
  const { state, account, setToast } = useApp();
  const { d, t, date, href, locale } = useI18n();
  const [limit, setLimit] = useState("");
  const user = state?.user;
  if (!user) return null;

  const saveLimit = async (value: number | null) => {
    if (await account({ action: "deposit_limit", amount: value })) {
      setLimit("");
      setToast(d.rg.saved);
    }
  };

  const exclude = async (days: number) => {
    if (!window.confirm(d.rg.confirm)) return;
    if (await account({ action: "self_exclude", days })) setToast(d.rg.saved);
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
      <div className="panel rounded-2xl p-6">
        <p className="micro text-neon-2">{d.rg.kicker}</p>
        <h3 className="mt-2 text-xl font-black text-white">{d.rg.title}</h3>
        <p className="mt-2 text-[13px] leading-7 text-mint">{d.rg.body}</p>
        <p className="mt-4 text-sm text-white">
          {user.depositLimit === null ? d.rg.none : t(d.rg.current, { limit: `${usd(user.depositLimit, locale)}` })}
        </p>
        {user.pendingLimit ? (
          <p className="mt-1 text-[12px] text-foil">
            {t(d.rg.pending, {
              limit: user.pendingLimit.amount === null ? d.rg.none : `${usd(user.pendingLimit.amount, locale)}`,
              time: date(user.pendingLimit.at),
            })}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            dir="ltr"
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={d.rg.limitLabel}
            aria-label={d.rg.limitLabel}
            className="focus-ring min-w-[180px] flex-1 rounded-xl border border-rule bg-black/30 px-4 py-3 font-display text-sm text-white placeholder:text-mint/40"
          />
          <button
            onClick={() => saveLimit(Number(limit))}
            disabled={!limit}
            className="btn-neon focus-ring rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50"
          >
            {d.rg.save}
          </button>
          {user.depositLimit !== null ? (
            <button onClick={() => saveLimit(null)} className="focus-ring rounded-xl border border-rule px-4 py-3 text-sm text-mint hover:text-white">
              {d.rg.remove}
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel rounded-2xl p-6">
        <p className="micro text-foil">{d.ui.selfExclusion}</p>
        <h3 className="mt-2 text-xl font-black text-white">{d.rg.excludeTitle}</h3>
        <p className="mt-2 text-[13px] leading-7 text-mint">{d.rg.excludeBody}</p>
        {user.selfExcludedUntil ? (
          <p className="mt-4 text-sm text-foil">{t(d.rg.excludedUntil, { date: date(user.selfExcludedUntil) })}</p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [1, d.rg.d1],
            [7, d.rg.d7],
            [30, d.rg.d30],
            [36500, d.rg.forever],
          ].map(([days, label]) => (
            <button
              key={String(days)}
              onClick={() => exclude(Number(days))}
              className="focus-ring rounded-xl border border-foil/30 px-3 py-3 text-sm text-foil transition-colors hover:bg-foil/10"
            >
              {label}
            </button>
          ))}
        </div>
        <a href={href("/responsible-gaming")} className="mt-4 inline-block text-[13px] text-neon-2 underline-offset-4 hover:underline">
          {d.rg.learn} →
        </a>
      </div>
    </div>
  );
}
