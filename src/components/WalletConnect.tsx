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
      <svg viewBox="0 0 32 32" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" aria-hidden>
        <defs>
          <linearGradient id="phantomGrad" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#4c1d95" />
          </linearGradient>
        </defs>
        <path
          d="M6.5 19.5C6.5 11.768 12.768 5.5 20.5 5.5C24.642 5.5 28 8.858 28 13V17.5C28 21.642 24.642 25 20.5 25H17.2C14.8 25 13.4 26.2 11.4 26.2C8.694 26.2 6.5 23.201 6.5 19.5Z"
          fill="url(#phantomGrad)"
        />
        <circle cx="15.5" cy="14.5" r="1.8" fill="#090714" />
        <circle cx="21.5" cy="14.5" r="1.8" fill="#090714" />
      </svg>
    );
  }

  if (key.includes("trust")) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" aria-hidden>
        <defs>
          <linearGradient id="trustGrad" x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="55%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>
        <path
          d="M16 4.5L26 8.8V15.6C26 21.8 21.7 26.5 16 28C10.3 26.5 6 21.8 6 15.6V8.8L16 4.5Z"
          fill="url(#trustGrad)"
        />
        <path
          d="M12.2 16.2L14.8 18.8L20.2 13.4"
          stroke="#eff6ff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key.includes("okx")) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" aria-hidden>
        <rect x="5" y="5" width="9" height="9" rx="2" fill="#ffffff" />
        <rect x="18" y="5" width="9" height="9" rx="2" fill="#d1d5db" />
        <rect x="11.5" y="11.5" width="9" height="9" rx="2" fill="#35ffb0" />
        <rect x="5" y="18" width="9" height="9" rx="2" fill="#d1d5db" />
        <rect x="18" y="18" width="9" height="9" rx="2" fill="#ffffff" />
      </svg>
    );
  }

  if (key.includes("bitget")) {
    return (
      <svg viewBox="0 0 32 32" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" fill="none" aria-hidden>
        <defs>
          <linearGradient id="bitgetGrad" x1="5" y1="6" x2="27" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="60%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
        </defs>
        <path
          d="M11 7H20.5C22.985 7 25 9.015 25 11.5C25 13.1 24.16 14.5 22.9 15.3C24.35 16.1 25.3 17.65 25.3 19.4C25.3 22.5 22.75 25 19.6 25H11V7Z"
          fill="url(#bitgetGrad)"
        />
        <path d="M14.5 11V14.2H19.8C20.8 14.2 21.5 13.5 21.5 12.6C21.5 11.7 20.8 11 19.8 11H14.5ZM14.5 17.5V21.5H19.4C20.5 21.5 21.3 20.7 21.3 19.5C21.3 18.3 20.5 17.5 19.4 17.5H14.5Z" fill="#041318" />
      </svg>
    );
  }

  return (
    <span className="font-display text-xs font-black text-neon-2 sm:text-sm">
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
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 group-active:scale-95 sm:h-9 sm:w-9 ${
        found
          ? "border-neon/40 bg-gradient-to-b from-white/[0.12] to-black/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),0_6px_14px_-4px_rgba(53,255,176,0.35)] group-hover:border-neon/70 group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_10px_20px_-6px_rgba(53,255,176,0.5)]"
          : "border-rule/90 bg-gradient-to-b from-white/[0.08] to-black/55 shadow-[inset_0_1px_1px_rgba(255,255,255,0.14),0_4px_10px_-4px_rgba(0,0,0,0.65)] group-hover:border-mint/50"
      }`}
    >
      {validSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          onError={() => setBroken(true)}
          className="h-4 w-4 rounded object-contain sm:h-[18px] sm:w-[18px]"
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