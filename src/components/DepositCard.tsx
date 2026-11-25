"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { useWallet, walletErrorMessage } from "./WalletProvider";
import { WalletList } from "./WalletConnect";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { Transaction } from "@solana/web3.js";

const AMOUNTS = [1, 3, 5, 10];
type Phase = "" | "build" | "sign" | "broadcast" | "confirm" | "done";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false }));
}

export function DepositCard() {
  const { state, setToast, isDemoSession, dataUnavailable } = useApp();
  const { d } = useI18n();
  const cfg = state?.config;
  const user = state?.user;
  const paymentsReady = Boolean(
    cfg?.paymentsEnabled && cfg?.solana?.enabled && !cfg?.maintenance,
  );

  const [amount, setAmount] = useState(1);
  const [custom, setCustom] = useState("");
  const chosen = custom ? Number(custom) : amount;

  if (isDemoSession) {
    return (
      <div className="panel min-w-0 rounded-2xl p-6">
        <p className="micro text-neon-2">{d.wallet.depositKicker} آ· {d.wc.demoBadge}</p>
        <h3 className="mt-2 text-xl font-black text-white">{d.wallet.depositTitle}</h3>
        <p dir="ltr" className="font-display tnum mt-4 text-3xl font-bold text-white">
          ${money(user?.balance ?? 0)} USDC
        </p>
        <p className="mt-3 text-[12px] leading-6 text-mint/80">{d.wc.demoWalletNote}</p>
      </div>
    );
  }

  return (
    <div className="panel min-w-0 rounded-2xl p-6">
      <p className="micro text-neon-2">{d.wallet.depositKicker}</p>
      <h3 className="mt-2 text-xl font-black text-white">{d.wallet.depositTitle}</h3>

      <div dir="ltr" className="mt-4 grid grid-cols-4 gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => {
              setAmount(a);
              setCustom("");
            }}
            className={`focus-ring rounded-xl border px-2 py-2.5 font-display tnum text-base font-bold transition-colors ${
              !custom && amount === a
                ? "border-neon bg-neon/15 text-neon-2"
                : "border-rule bg-black/25 text-white hover:border-mint/40"
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
        placeholder={`${d.wallet.custom} آ· min ${cfg?.minDeposit ?? 1}`}
        aria-label={d.wallet.custom}
        className="focus-ring mt-2 w-full rounded-xl border border-rule bg-black/30 px-4 py-2.5 font-display text-sm text-white placeholder:text-mint/40"
      />

      <SolanaDeposit
        amount={chosen}
        dataUnavailable={dataUnavailable}
        paymentsReady={paymentsReady}
      />
    </div>
  );
}

function SolanaDeposit({
  amount,
  dataUnavailable,
  paymentsReady,
}: {
  amount: number;
  dataUnavailable: boolean;
  paymentsReady: boolean;
}) {
  const { state, refresh, setToast } = useApp();
  const wallet = useWallet();
  const { d, t } = useI18n();
  const user = state?.user;
  const treasuryAddress = state?.config?.solana?.treasuryAddress ?? "";
  const [phase, setPhase] = useState<Phase>("");
  const [link, setLink] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [bal, setBal] = useState<{ usdc: number; sol: number } | null>(null);
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
            ? `${d.wc.yourWallet}: ${user.walletAddress.slice(0, 6)}â€¦${user.walletAddress.slice(-4)}`
            : d.wc.needWallet}
        </p>
        <WalletList acceptTerms />
      </div>
    );
  }

  const poll = async (id: number) => {
    for (let i = 0; i < 45; i++) {
      await sleep(4000);
      const r = await fetch(`/api/wallet/deposit?id=${id}`, { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
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
    if (dataUnavailable) {
      setToast(d.errors.unavailable);
      return;
    }
    if (!paymentsReady) {
      setToast(d.wc.comingSoonToast);
      return;
    }
    setLink(null);
    setPhase("build");
    try {
      const built = await post("/api/wallet/deposit", {
        step: "build",
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!built.ok) throw new Error(built.error);
      setPhase("sign");
      const serialized = built.transaction?.serializedTransactionBase64;
      if (!serialized) throw new Error("Invalid Solana transaction");
      const transaction = Transaction.from(
        Uint8Array.from(atob(serialized), (c) => c.charCodeAt(0)),
      );
      const signed = await wallet.signTransaction(transaction);
      setPhase("broadcast");
      const sent = await post("/api/wallet/deposit", {
        step: "submit",
        depositId: built.depositId,
        signedTransaction: signed,
      });
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
    if (!paymentsReady) {
      setToast(d.wc.comingSoonToast);
      return;
    }
    const trimmed = txid.trim();
    if (!trimmed) return;
    const r = await post("/api/wallet/claim", { txid: trimmed });
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
          {bal ? `${money(bal.usdc)} USDC آ· ${bal.sol.toFixed(3)} SOL` : "â€”"}
        </span>
      </div>

      <button
        onClick={pay}
        disabled={!paymentsReady || dataUnavailable || (phase !== "" && phase !== "done") || !amount || Boolean(user.selfExcludedUntil)}
        className="btn-neon focus-ring mt-3 w-full rounded-xl px-6 py-3.5 text-base font-bold disabled:opacity-60"
      >
        {t(d.wc.payFromWallet, { amount: money(amount || 0) })}
      </button>

      {phase ? (
        <ol className="mt-3 space-y-1.5" aria-live="polite">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 text-[12px] ${
                i < idx ? "text-neon-2" : i === idx ? "text-foil" : "text-mint/50"
              }`}
            >
              <span className="w-4 text-center">{i < idx ? "âœ“" : i === idx ? "â—ڈ" : "â—‹"}</span>
              {stepLabel[s]}
            </li>
          ))}
          {phase === "done" ? (
            <li className="text-[12px] font-bold text-neon-2">{d.wc.step_done}</li>
          ) : null}
        </ol>
      ) : null}

      {link ? (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-neon-2 hover:underline">
            {d.wc.viewTx} â†—
          </a>
          {phase === "confirm" && pendingId ? (
            <button onClick={() => poll(pendingId)} className="text-mint hover:text-white">
              {d.wc.checkAgain}
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-5 text-mint/70">{d.wc.solFee}</p>

      <details className="mt-3 rounded-xl border border-dashed border-rule px-4 py-3">
        <summary className="text-[12px] text-mint hover:text-white">{d.wc.manualTitle}</summary>
        <p className="mt-2 text-[12px] leading-6 text-mint">{d.wc.manualBody}</p>
        <div className="mt-2 flex items-center gap-2">
          <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-3 py-2 font-display text-[11px] text-neon-2">
            {treasuryAddress}
          </code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(treasuryAddress).catch(() => {});
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
          <button
            onClick={claim}
            disabled={!paymentsReady || txid.trim().length < 32}
            className="btn-foil rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50"
          >
            {d.wc.claim}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mint/60">{d.wc.onlyFromLinked}</p>
      </details>
    </div>
  );
}
