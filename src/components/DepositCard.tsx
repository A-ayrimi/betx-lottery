"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useWallet, walletErrorMessage } from "./WalletProvider";
import { SoonBadge, WalletList } from "./WalletConnect";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";

const AMOUNTS = [1, 3, 5, 10];
type Method = "wallet" | "invoice" | "demo";
type Phase = "" | "build" | "sign" | "broadcast" | "confirm" | "done";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json().catch(() => ({ ok: false }));
}

export function DepositCard() {
  const { state, deposit, setToast } = useApp();
  const { d, t } = useI18n();
  const cfg = state?.config;
  const user = state?.user;
  const live = Boolean(cfg?.live);

  const tronOnly = cfg?.tronOnly !== false;
  // TRON-only mode: the TRON wallet tab is the only enabled method; the
  // others stay visible but disabled with a "coming soon" badge.
  const methods: { id: Method; enabled: boolean }[] = tronOnly
    ? [
        { id: "wallet", enabled: true },
        ...(live
          ? [{ id: "invoice" as Method, enabled: false }]
          : [{ id: "demo" as Method, enabled: false }]),
      ]
    : [
        ...(cfg?.tron.enabled ? [{ id: "wallet" as Method, enabled: true }] : []),
        ...(live && cfg?.paymentsEnabled ? [{ id: "invoice" as Method, enabled: true }] : []),
        ...(!live ? [{ id: "demo" as Method, enabled: true }] : []),
      ];
  const [method, setMethod] = useState<Method>(methods[0]?.id ?? "wallet");
  const [amount, setAmount] = useState(1);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = custom ? Number(custom) : amount;

  const labels: Record<Method, string> = { wallet: d.wc.methodWallet, invoice: d.wc.methodInvoice, demo: "Demo" };

  const payOther = async () => {
    if (!user) return setToast(d.errors.loginToDeposit);
    setBusy(true);
    await deposit(chosen);
    setBusy(false);
  };

  return (
    <div className="panel min-w-0 rounded-2xl p-6">
      <p className="micro text-neon-2">{d.wallet.depositKicker}</p>
      <h3 className="mt-2 text-xl font-black text-white">{d.wallet.depositTitle}</h3>

      {methods.length > 1 ? (
        <div className="mt-4 grid grid-flow-col gap-1 rounded-xl border border-rule bg-black/30 p-1">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                if (m.enabled) setMethod(m.id);
                else setToast(d.wc.comingSoonToast);
              }}
              aria-disabled={!m.enabled}
              title={m.enabled ? undefined : d.wc.comingSoonToast}
              className={`focus-ring flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-bold transition-colors ${
                method === m.id
                  ? "bg-neon/15 text-neon-2"
                  : m.enabled
                    ? "text-mint hover:text-white"
                    : "cursor-not-allowed text-mint/50"
              }`}
            >
              {labels[m.id]}
              {!m.enabled ? <SoonBadge label={d.wc.comingSoon} /> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div dir="ltr" className="mt-4 grid grid-cols-4 gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => {
              setAmount(a);
              setCustom("");
            }}
            className={`focus-ring rounded-xl border px-2 py-2.5 font-display tnum text-base font-bold transition-colors ${
              !custom && amount === a ? "border-neon bg-neon/15 text-neon-2" : "border-rule bg-black/25 text-white hover:border-mint/40"
            }`}
          >
            ${a}
          </button>
        ))}
      </div>
      <input
        dir="ltr"
        inputMode="decimal"
        value={custom}
        onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={`${d.wallet.custom} · min ${cfg?.minDeposit ?? 1}`}
        aria-label={d.wallet.custom}
        className="focus-ring mt-2 w-full rounded-xl border border-rule bg-black/30 px-4 py-2.5 font-display text-sm text-white placeholder:text-mint/40"
      />

      {method === "wallet" ? (
        <TronDeposit amount={chosen} />
      ) : (
        <>
          <button
            onClick={payOther}
            disabled={busy || !chosen || Boolean(user?.selfExcludedUntil)}
            className="btn-neon focus-ring mt-4 w-full rounded-xl px-6 py-3.5 text-base font-bold disabled:opacity-60"
          >
            {busy ? d.wallet.creating : t(method === "invoice" ? d.wallet.payLive : d.wallet.payDemo, { amount: `$${money(chosen || 0)}` })}
          </button>
          <p className="mt-3 text-[12px] leading-6 text-mint/80">{method === "invoice" ? d.wc.invoiceNote : d.wallet.hintDemo}</p>
        </>
      )}
    </div>
  );
}

function TronDeposit({ amount }: { amount: number }) {
  const { state, refresh, setToast } = useApp();
  const wallet = useWallet();
  const { d, t } = useI18n();
  const user = state?.user;
  const tronCfg = state?.config.tron;
  const [phase, setPhase] = useState<Phase>("");
  const [link, setLink] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bal, setBal] = useState<{ usdt: number; trx: number } | null>(null);
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.walletAddress) return;
    fetch("/api/wallet/info", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.ok && j.balances && setBal(j.balances))
      .catch(() => {});
  }, [user?.walletAddress, phase]);

  if (!user) return <p className="mt-4 text-sm text-mint">{d.errors.loginToDeposit}</p>;

  if (!user.walletAddress || !wallet.address || wallet.address !== user.walletAddress) {
    return (
      <div className="mt-4">
        <p className="mb-3 text-[13px] leading-6 text-mint">
          {user.walletAddress && wallet.address && wallet.address !== user.walletAddress
            ? `${d.wc.yourWallet}: ${user.walletAddress.slice(0, 6)}…${user.walletAddress.slice(-4)}`
            : d.wc.needWallet}
        </p>
        <WalletList acceptTerms />
      </div>
    );
  }

  const poll = async (id: number) => {
    for (let i = 0; i < 45; i++) {
      await sleep(4000);
      const r = await fetch(`/api/wallet/deposit?id=${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (r?.ok && r.credited) {
        setPhase("done");
        await refresh();
        setToast(`${d.wc.step_done} +$${money(r.amount)}`);
        return;
      }
      if (r?.ok && (r.status === "failed" || r.status === "expired")) {
        setPhase("");
        setToast((d.wallet.status as Record<string, string>)[r.status] ?? r.status);
        return;
      }
    }
  };

  const pay = async () => {
    setLink(null);
    setPhase("build");
    try {
      const built = await post("/api/wallet/deposit", { step: "build", amount });
      if (!built.ok) throw new Error(built.error);
      setPhase("sign");
      const signed = await wallet.signTransaction(built.transaction);
      setPhase("broadcast");
      const sent = await post("/api/wallet/deposit", { step: "submit", depositId: built.depositId, signedTransaction: signed });
      if (!sent.ok) throw new Error(sent.error);
      setLink(sent.explorer);
      setPendingId(built.depositId);
      setPhase("confirm");
      await poll(built.depositId);
    } catch (e) {
      setToast(walletErrorMessage(e));
      setPhase("");
    }
  };

  const claim = async () => {
    const r = await post("/api/wallet/claim", { txid: txid.trim() });
    if (!r.ok) return setToast(r.error);
    setTxid("");
    await refresh();
    setToast(`${d.wc.step_done} +$${money(r.amount)}`);
  };

  const steps: Phase[] = ["build", "sign", "broadcast", "confirm"];
  const idx = phase === "done" ? steps.length : steps.indexOf(phase);
  const stepLabel: Record<string, string> = {
    build: d.wc.step_build,
    sign: d.wc.step_sign,
    broadcast: d.wc.step_broadcast,
    confirm: d.wc.step_confirm,
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-black/25 px-4 py-2.5 text-[12px]">
        <span className="text-mint">{d.wc.walletBalance}</span>
        <span dir="ltr" className="font-display tnum text-white">
          {bal ? `${money(bal.usdt)} USDT · ${bal.trx.toFixed(1)} TRX` : "—"}
        </span>
      </div>

      <button
        onClick={pay}
        disabled={(phase !== "" && phase !== "done") || !amount || Boolean(user.selfExcludedUntil)}
        className="btn-neon focus-ring mt-3 w-full rounded-xl px-6 py-3.5 text-base font-bold disabled:opacity-60"
      >
        {t(d.wc.payFromWallet, { amount: money(amount || 0) })}
      </button>

      {phase ? (
        <ol className="mt-3 space-y-1.5" aria-live="polite">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 text-[12px] ${i < idx ? "text-neon-2" : i === idx ? "text-foil" : "text-mint/50"}`}>
              <span className="w-4 text-center">{i < idx ? "✓" : i === idx ? "●" : "○"}</span>
              {stepLabel[s]}
            </li>
          ))}
          {phase === "done" ? <li className="text-[12px] font-bold text-neon-2">{d.wc.step_done}</li> : null}
        </ol>
      ) : null}
      {link ? (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-neon-2 hover:underline">{d.wc.viewTx} ↗</a>
          {phase === "confirm" && pendingId ? (
            <button onClick={() => poll(pendingId)} className="text-mint hover:text-white">{d.wc.checkAgain}</button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-5 text-mint/70">{d.wc.trxFee}</p>

      <details className="mt-3 rounded-xl border border-dashed border-rule px-4 py-3">
        <summary className="text-[12px] text-mint hover:text-white">{d.wc.manualTitle}</summary>
        <p className="mt-2 text-[12px] leading-6 text-mint">{d.wc.manualBody}</p>
        <div className="mt-2 flex items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 font-display text-[11px] text-neon-2">
            {tronCfg?.depositAddress}
          </code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(tronCfg?.depositAddress ?? "").catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg border border-rule px-3 py-2 text-[11px] text-mint hover:text-white"
          >
            {copied ? d.wc.copied : d.wc.copy}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <input
            dir="ltr"
            value={txid}
            onChange={(e) => setTxid(e.target.value)}
            placeholder={d.wc.txidPlaceholder}
            className="focus-ring min-w-0 flex-1 rounded-lg border border-rule bg-black/30 px-3 py-2 font-display text-[11px] text-white placeholder:text-mint/40"
          />
          <button onClick={claim} disabled={txid.trim().length !== 64} className="btn-foil rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50">
            {d.wc.claim}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mint/60">{d.wc.onlyFromLinked}</p>
      </details>
    </div>
  );
}
