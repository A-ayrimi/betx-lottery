"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { useWallet, walletErrorMessage } from "./WalletProvider";
import { useI18n } from "@/i18n/client";
import { writeStored } from "@/lib/useStored";
import { money } from "@/lib/format";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false }));
}

function WalletIcon({ name, icon }: { name: string; icon?: string }) {
  const [broken, setBroken] = useState(false);
  const validSrc =
    !broken &&
    typeof icon === "string" &&
    (icon.startsWith("/") ||
      icon.startsWith("https://") ||
      icon.startsWith("http://") ||
      icon.startsWith("data:image/"));

  if (!validSrc) {
    return (
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neon/30 bg-neon/10 font-display text-xs font-bold text-neon-2"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt=""
      onError={() => setBroken(true)}
      className="h-7 w-7 shrink-0 rounded-lg object-contain"
    />
  );
}

/**
 * Wallet picker + Sign-In with Solana.
 * connect -> server nonce -> wallet signs (free, off-chain) -> server verifies.
 */
export function WalletList({
  acceptTerms,
  onDone,
}: {
  acceptTerms: boolean;
  onDone?: () => void;
}) {
  const { state, refresh, setToast, pendingRef, demoEnabled, startDemoSession } =
    useApp();
  const { wallets, ready, connect, connectDemo, signMessage } = useWallet();
  const { d, t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<"" | "connect" | "sign">("");
  const linking = Boolean(state?.user);
  const needsTerms = !linking && !acceptTerms;

  const login = async (name: string, readyState: string) => {
    if (demoEnabled) return;
    if (needsTerms) return setToast(d.errors.mustAccept);
    if (readyState !== "Found") {
      setToast(d.wc.noWallet);
      return;
    }
    setBusy(name);
    try {
      setStep("connect");
      const address = await connect(name);
      setStep("sign");
      const challenge = await post("/api/wallet/nonce", { address });
      if (!challenge.ok) throw new Error(challenge.error);
      const signature = await signMessage(challenge.message);
      const res = await post("/api/wallet/verify", {
        nonce: challenge.nonce,
        signature,
        acceptTerms,
        referral: pendingRef,
      });
      if (!res.ok) throw new Error(res.error);
      if (res.created) writeStored("betx_ref", null);
      await refresh();
      setToast(
        res.linked
          ? d.wc.linked
          : res.created
            ? d.toast.welcome
            : d.wc.connected
      );
      onDone?.();
    } catch (e) {
      setToast(walletErrorMessage(e));
    } finally {
      setBusy(null);
      setStep("");
    }
  };

  const loginDemo = () => {
    if (!acceptTerms) {
      setToast(d.errors.mustAccept);
      return;
    }
    setBusy("demo");
    try {
      const address = connectDemo();
      startDemoSession(address);
      setToast(t(d.wc.demoConnected, { address, balance: "100.00" }));
      onDone?.();
    } catch (e) {
      setToast(walletErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {!demoEnabled ? (
        <div className="grid gap-2">
          {!ready ? (
            Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-[54px] animate-pulse rounded-xl border border-rule bg-white/[0.03]"
              />
            ))
          ) : (
            wallets.map((w) => {
              const found = w.readyState === "Found";
              return (
                <button
                  key={w.name}
                  onClick={() => login(w.name, w.readyState)}
                  disabled={busy !== null}
                  className={`focus-ring flex items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors disabled:opacity-60 ${
                    found
                      ? "border-neon/40 bg-neon/[0.06] hover:bg-neon/[0.12]"
                      : "border-rule bg-black/20 hover:border-mint/40"
                  } ${needsTerms ? "opacity-70" : ""}`}
                >
                  <WalletIcon name={w.name} icon={w.icon} />
                  <span className="flex-1 text-sm font-bold text-white">
                    {w.name}
                  </span>
                  <span
                    className={`micro ${found ? "text-neon-2" : "text-mint"}`}
                  >
                    {busy === w.name
                      ? "…"
                      : found
                        ? d.wc.detected
                        : d.wc.install}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
      {!state?.user && demoEnabled ? (
        <div className="mt-4 rounded-xl border border-foil/40 bg-foil/[0.06] p-3">
          <button
            type="button"
            onClick={loginDemo}
            disabled={busy !== null}
            className="btn-foil focus-ring w-full rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-60"
          >
            {busy === "demo" ? "…" : d.wc.demoLogin}
          </button>
          <p className="mt-2 text-[11px] leading-5 text-mint/80">
            {d.wc.demoWalletNote}
          </p>
        </div>
      ) : null}
      {step ? (
        <p
          className="mt-3 flex items-center gap-2 text-[12px] text-foil"
          role="status"
        >
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-foil" />
          {step === "connect" ? d.wc.stepConnect : d.wc.stepSign}
        </p>
      ) : ready && wallets.every((w) => w.readyState !== "Found") ? (
        <p className="mt-3 text-[12px] leading-6 text-mint/80">
          {d.wc.noWallet}
        </p>
      ) : null}
    </div>
  );
}

export function SoonBadge({ label }: { label: string }) {
  return (
    <span className="micro shrink-0 rounded-full border border-foil/40 bg-foil/10 px-2 py-0.5 text-foil">
      {label}
    </span>
  );
}

export function AddressChip({
  address,
  usdc,
  sol,
  usdt,
  trx,
  balanceLabel,
  demo = false,
  onClick,
}: {
  address: string;
  usdc?: number | null;
  sol?: number | null;
  usdt?: number | null;
  trx?: number | null;
  balanceLabel: string;
  demo?: boolean;
  onClick?: () => void;
}) {
  const resolvedUsdc = usdc !== undefined ? usdc : (usdt ?? null);
  const resolvedSol = sol !== undefined ? sol : (trx ?? null);
  const usdcText = resolvedUsdc === null ? "—" : money(resolvedUsdc);
  const solText = resolvedSol === null ? "—" : money(resolvedSol);

  return (
    <button
      onClick={onClick}
      className="focus-ring flex items-center gap-2 rounded-full border border-neon/30 bg-neon/[0.07] px-3 py-1.5"
      title={`${address}\n${balanceLabel}: ${usdcText} USDC · ${solText} SOL`}
      aria-label={`${demo ? "DEMO " : ""}${address}, ${balanceLabel}: ${usdcText} USDC, ${solText} SOL`}
    >
      <span className="h-2 w-2 rounded-full bg-neon-2 shadow-[0_0_10px_2px_rgba(53,255,176,0.7)]" />
      <span className="flex flex-col items-start leading-tight">
        <span
          dir="ltr"
          className="font-display text-[11px] font-bold text-white"
        >
          {address.slice(0, 4)}…{address.slice(-4)}
        </span>
        <span
          dir="ltr"
          className="font-display tnum whitespace-nowrap text-[9px] text-neon-2"
        >
          {usdcText} USDC · {solText} SOL
        </span>
      </span>
      {demo ? (
        <span className="micro rounded-full border border-foil/40 px-1.5 py-0.5 text-[8px] text-foil">
          DEMO
        </span>
      ) : null}
    </button>
  );
}