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

function BrandGlyph({ name }: { name: string }) {
  const key = name.trim().toLowerCase();

  if (key.includes("phantom")) {
    return (
      <svg viewBox="0 0 40 40" className="block h-full w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id="phantomModernBg" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#phantomModernBg)" />
        <path
          d="M9 22.8C9 14.185 15.935 7.2 24.5 7.2C30.023 7.2 34.5 11.677 34.5 17.2V21.2C34.5 26.447 30.247 30.7 25 30.7H21.2C18.5 30.7 16.9 32.5 14.3 32.5C11.373 32.5 9 28.155 9 22.8Z"
          fill="#f5f3ff"
        />
        <circle cx="19.5" cy="18.2" r="2.1" fill="#4c1d95" />
        <circle cx="26.5" cy="18.2" r="2.1" fill="#4c1d95" />
      </svg>
    );
  }

  if (key.includes("trust")) {
    return (
      <svg viewBox="0 0 40 40" className="block h-full w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id="trustModernShell" x1="20" y1="6" x2="20" y2="34" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id="trustModernShield" x1="20" y1="8.5" x2="20" y2="31.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="52%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#trustModernShell)" />
        <path
          d="M20 8.5L30.5 12.9V19.9C30.5 26.4 26 31.3 20 33C14 31.3 9.5 26.4 9.5 19.9V12.9L20 8.5Z"
          fill="url(#trustModernShield)"
          stroke="#ffffff"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
      </svg>
    );
  }

  if (key.includes("okx")) {
    return (
      <svg viewBox="0 0 40 40" className="block h-full w-full" fill="none" aria-hidden>
        <rect width="40" height="40" fill="#090c0f" />
        <g transform="translate(20 20) rotate(45) translate(-20 -20)">
          <rect x="9" y="9" width="9" height="9" rx="2" fill="#ffffff" />
          <rect x="22" y="9" width="9" height="9" rx="2" fill="#ffffff" />
          <rect x="9" y="22" width="9" height="9" rx="2" fill="#ffffff" />
          <rect x="22" y="22" width="9" height="9" rx="2" fill="#ffffff" />
        </g>
      </svg>
    );
  }

  if (key.includes("bitget")) {
    return (
      <svg viewBox="0 0 40 40" className="block h-full w-full" fill="none" aria-hidden>
        <defs>
          <linearGradient id="bitgetModernBg" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="55%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#bitgetModernBg)" />
        <path
          d="M13 10.5H23.8C26.8 10.5 29 12.6 29 15.3C29 17.2 27.9 18.8 26.3 19.6C28.3 20.5 29.6 22.3 29.6 24.6C29.6 27.6 27.1 30 23.9 30H13V10.5Z"
          fill="#ffffff"
        />
        <path
          d="M17.2 14.5V17.9H23.2C24.3 17.9 25 17.2 25 16.2C25 15.2 24.3 14.5 23.2 14.5H17.2ZM17.2 21.8V26H23.1C24.3 26 25.1 25.2 25.1 23.9C25.1 22.6 24.3 21.8 23.1 21.8H17.2Z"
          fill="#093846"
        />
      </svg>
    );
  }

  return (
    <span className="flex h-full w-full items-center justify-center bg-neon/15 font-display text-sm font-black text-neon-2">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function WalletIcon({
  name,
  icon,
  found,
}: {
  name: string;
  icon?: string;
  found: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const key = name.trim().toLowerCase();
  const hasKnownVector =
    key.includes("phantom") ||
    key.includes("trust") ||
    key.includes("okx") ||
    key.includes("bitget");

  const validSrc =
    !hasKnownVector &&
    !broken &&
    typeof icon === "string" &&
    (icon.startsWith("/") ||
      icon.startsWith("https://") ||
      icon.startsWith("http://") ||
      icon.startsWith("data:image/"));

  return (
    <span
      aria-hidden
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 group-active:scale-95 sm:h-10 sm:w-10 ${
        found
          ? "border-neon/60 shadow-[0_6px_16px_-4px_rgba(53,255,176,0.45)] group-hover:border-neon group-hover:shadow-[0_10px_22px_-4px_rgba(53,255,176,0.65)]"
          : "border-white/20 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)] group-hover:border-white/40"
      }`}
    >
      {validSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <BrandGlyph name={name} />
      )}
    </span>
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
  const { d, t, locale } = useI18n();
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
      setToast(t(d.wc.demoConnected, { address, balance: money(100, locale) }));
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
        <div className="grid gap-2 sm:gap-2.5">
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
                  type="button"
                  onClick={() => login(w.name, w.readyState)}
                  disabled={busy !== null}
                  className={`group focus-ring flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start transition-all duration-200 disabled:opacity-60 sm:gap-3.5 sm:px-4 sm:py-3 ${
                    found
                      ? "border-neon/40 bg-neon/[0.06] hover:-translate-y-[1px] hover:border-neon/70 hover:bg-neon/[0.12] hover:shadow-[0_10px_24px_-12px_rgba(53,255,176,0.45)]"
                      : "border-rule bg-black/20 hover:-translate-y-[1px] hover:border-mint/40 hover:bg-white/[0.03]"
                  } ${needsTerms ? "opacity-70" : ""}`}
                >
                  <WalletIcon name={w.name} icon={w.icon} found={found} />
                  <span className="flex-1 text-xs font-bold text-white sm:text-sm">
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
  const { locale } = useI18n();
  const resolvedUsdc = usdc !== undefined ? usdc : (usdt ?? null);
  const resolvedSol = sol !== undefined ? sol : (trx ?? null);
  const usdcText = resolvedUsdc === null ? "—" : money(resolvedUsdc, locale);
  const solText = resolvedSol === null ? "—" : money(resolvedSol, locale);

  return (
    <button
      type="button"
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