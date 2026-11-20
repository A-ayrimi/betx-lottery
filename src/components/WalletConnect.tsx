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
      <svg viewBox="0 0 40 40" className="h-full w-full block" fill="none" aria-hidden>
        <defs>
          <linearGradient id="phantomBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#phantomBg)" />
        <path
          d="M8.5 23.5C8.5 14.387 15.887 7 25 7C30.247 7 34.5 11.253 34.5 16.5V21.5C34.5 26.747 30.247 31 25 31H20.8C17.9 31 16.2 32.4 13.8 32.4C10.871 32.4 8.5 28.415 8.5 23.5Z"
          fill="#f5f3ff"
        />
        <circle cx="19.2" cy="18.2" r="2.2" fill="#4c1d95" />
        <circle cx="26.5" cy="18.2" r="2.2" fill="#4c1d95" />
      </svg>
    );
  }

  if (key.includes("trust")) {
    return (
      <svg viewBox="0 0 40 40" className="h-full w-full block" fill="none" aria-hidden>
        <defs>
          <linearGradient id="trustBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#trustBg)" />
        <path
          d="M20 7.5L31.5 12.4V20.2C31.5 27.3 26.5 32.6 20 34.5C13.5 32.6 8.5 27.3 8.5 20.2V12.4L20 7.5Z"
          fill="#ffffff"
          fillOpacity="0.96"
        />
        <path
          d="M15.2 20.6L18.4 23.8L25.2 17"
          stroke="#1d4ed8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key.includes("okx")) {
    return (
      <svg viewBox="0 0 40 40" className="h-full w-full block" fill="none" aria-hidden>
        <rect width="40" height="40" fill="#0b0f12" />
        <rect x="7" y="7" width="11" height="11" rx="2.5" fill="#ffffff" />
        <rect x="22" y="7" width="11" height="11" rx="2.5" fill="#e5e7eb" />
        <rect x="14.5" y="14.5" width="11" height="11" rx="2.5" fill="#ffffff" />
        <rect x="7" y="22" width="11" height="11" rx="2.5" fill="#e5e7eb" />
        <rect x="22" y="22" width="11" height="11" rx="2.5" fill="#ffffff" />
      </svg>
    );
  }

  if (key.includes("bitget")) {
    return (
      <svg viewBox="0 0 40 40" className="h-full w-full block" fill="none" aria-hidden>
        <defs>
          <linearGradient id="bitgetBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="60%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#155e75" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" fill="url(#bitgetBg)" />
        <path
          d="M13.5 9.5H24.5C27.538 9.5 30 11.962 30 15C30 17.05 28.88 18.84 27.22 19.78C29.12 20.82 30.4 22.82 30.4 25.1C30.4 28.47 27.67 31.2 24.3 31.2H13.5V9.5Z"
          fill="#ffffff"
        />
        <path
          d="M17.8 14V17.8H24.2C25.5 17.8 26.4 16.9 26.4 15.8C26.4 14.7 25.5 14 24.2 14H17.8ZM17.8 22V26.8H23.8C25.2 26.8 26.2 25.8 26.2 24.4C26.2 23 25.2 22 23.8 22H17.8Z"
          fill="#0b3b49"
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
  const resolvedUsdc = usdc !== undefined ? usdc : (usdt ?? null);
  const resolvedSol = sol !== undefined ? sol : (trx ?? null);
  const usdcText = resolvedUsdc === null ? "—" : money(resolvedUsdc);
  const solText = resolvedSol === null ? "—" : money(resolvedSol);

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