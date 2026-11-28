"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Logo } from "./Logo";
import { useApp } from "./AppProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AddressChip, SoonBadge, WalletList } from "./WalletConnect";
import { AnimatedMoney } from "./AnimatedMoney";
import { BalanceBadge } from "./BalanceBadge";
import { useWallet } from "./WalletProvider";
import { useI18n } from "@/i18n/client";

export function Header() {
  const {
    state,
    connect,
    logout,
    setToast,
    pendingRef,
    walletConnectOpen,
    openWalletConnect,
    closeWalletConnect,
    demoEnabled,
    isDemoSession,
    isPreview,
  } = useApp();
  const { address: connectedAddress, disconnect } = useWallet();
  const { d, href, dir } = useI18n();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({ username: "", telegram: "", referral: "", accept: false });
  const [walletBalance, setWalletBalance] = useState<{
    address: string;
    balances: { usdc: number; sol: number } | null;
  } | null>(null);

  const NAV = [
    { href: "#pool", label: d.nav.pool },
    { href: "#transparency", label: d.nav.transparency },
    { href: "#wheel", label: d.nav.wheel },
    { href: "#wallet", label: d.nav.wallet },
    { href: "#invite", label: d.nav.invite },
    { href: "#faq", label: d.nav.faq },
    { href: href("/install"), label: d.pwa.pwaMenu },
  ];

  const user = state?.user ?? null;
  const walletAddress = connectedAddress;
  const walletMatchesAccount = !connectedAddress || connectedAddress === user?.walletAddress;
  const walletBalances =
    isDemoSession && walletAddress === user?.walletAddress
      ? { usdc: user.balance, sol: 0 }
      : walletMatchesAccount && walletBalance?.address === walletAddress
        ? walletBalance.balances
        : null;
  const live = state?.config.live ?? !demoEnabled;
  const maintenance = Boolean(state?.config?.maintenanceMode ?? state?.config?.maintenance);
  const vaultStatusOnline = Boolean(state) && live && !maintenance;
  const vaultAddress = state?.vault.adminWallet ?? state?.config.adminWallet ?? "";
  const networkName = state?.config?.solana?.network;
 const testnet = Boolean(networkName && String(networkName) !== "mainnet" && String(networkName) !== "mainnet-beta");
  const bot = state?.config.botUsername;
  const botStart = bot ? `https://t.me/${bot}${pendingRef ? `?start=ref_${pendingRef}` : ""}` : null;

  useEffect(() => {
    if (isDemoSession || !walletAddress) {
      return;
    }

    let active = true;
    const loadBalances = async () => {
      try {
        const response = await fetch("/api/wallet/info", { cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!active) return;
        const balances =
          response.ok && result?.ok && result.address === walletAddress ? result.balances : null;
        setWalletBalance({ address: walletAddress, balances });
      } catch {
        if (active) setWalletBalance({ address: walletAddress, balances: null });
      }
    };

    void loadBalances();
    const interval = window.setInterval(() => void loadBalances(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isDemoSession, walletAddress]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const handleLogout = async () => {
    const wasDemo = isDemoSession;
    await logout();
    if (wasDemo || connectedAddress) await disconnect();
  };

  const openModal = () => {
    setForm((f) => ({ ...f, referral: f.referral || pendingRef }));
    openWalletConnect();
  };

  const submitDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await connect(form.username, form.telegram, form.referral, form.accept);
    setBusy(false);
    if (ok) closeWalletConnect();
  };

  return (
    <>
      <header className="relative border-b border-rule/70 bg-[#060a09]/82 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          <a href="#top" className="focus-ring flex min-w-0 shrink items-center gap-2 rounded-lg" dir="ltr">
            <Logo />
            {testnet ? <span className="micro rounded bg-foil/15 px-1.5 py-0.5 text-foil">{d.wc.testnet}</span> : null}
          </a>

          <nav className="hidden items-center gap-6 xl:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="focus-ring rounded text-[13px] font-medium text-mint transition-colors hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? d.ui.closeMenu : d.ui.openMenu}
              aria-controls="mobile-nav"
              aria-expanded={menuOpen}
              className="focus-ring rounded-full border border-rule p-2 text-mint transition-colors hover:border-mint/50 hover:text-white xl:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
            <LanguageSwitcher />

            <div className="hidden items-center gap-2 rounded-full border border-rule px-3 py-2 lg:flex">
              <span className={`h-2 w-2 rounded-full ${vaultStatusOnline ? "live-dot bg-neon-2" : "bg-foil"}`} />
              <span className="micro text-mint">{d.footer.vault}</span>
              <BalanceBadge kind={demoEnabled || isDemoSession || isPreview ? "demo" : "ledger"} />
              <span dir="ltr" className="font-display tnum text-sm font-bold text-neon-2">
                {state ? <AnimatedMoney value={state.vault.balance} /> : d.ui.noData}
              </span>
              {vaultAddress ? (
                <span dir="ltr" title={vaultAddress} className="font-display text-[9px] text-mint/60">
                  {vaultAddress.slice(0, 5)}…{vaultAddress.slice(-4)}
                </span>
              ) : null}
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                {walletMatchesAccount ? (
                  <>
                    <span dir="ltr" className="hidden font-display tnum text-sm font-bold text-white sm:inline">
                      <AnimatedMoney value={user.balance} />
                    </span>
                    <span className="hidden sm:inline">
                      <BalanceBadge kind={demoEnabled || isDemoSession || isPreview ? "demo" : "ledger"} />
                    </span>
                  </>
                ) : null}
                {walletAddress ? (
                  <AddressChip
                    address={walletAddress}
                    usdc={walletBalances?.usdc ?? null}
                    sol={walletBalances?.sol ?? null}
                    balanceLabel={d.wc.walletBalance}
                    demo={isDemoSession}
                    onClick={() => (window.location.hash = "wallet")}
                  />
                ) : (
                  <button type="button" dir={dir} onClick={openModal} className="btn-neon focus-ring rounded-full px-4 py-2 text-xs font-bold">
                    {!live ? d.wc.demoAlt : d.wc.linkWallet}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="focus-ring rounded-full border border-rule px-3 py-2 text-xs text-mint transition-colors hover:border-mint/50 hover:text-white"
                >
                  {d.header.logout}
                </button>
              </div>
            ) : walletAddress ? (
              <div className="flex items-center gap-2">
                <AddressChip
                  address={walletAddress}
                  usdc={walletBalances?.usdc ?? null}
                  sol={walletBalances?.sol ?? null}
                  balanceLabel={d.wc.walletBalance}
                  demo={isDemoSession}
                  onClick={openModal}
                />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="focus-ring rounded-full border border-rule px-3 py-2 text-xs text-mint transition-colors hover:border-mint/50 hover:text-white"
                >
                  {d.header.logout}
                </button>
              </div>
            ) : (
              <button
                type="button"
                dir={dir}
                onClick={openModal}
                aria-label={d.wc.connectWallet}
                className="btn-foil focus-ring flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2.5 text-[13px] font-bold min-[400px]:px-4 sm:px-5"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="6" width="18" height="13" rx="2.5" />
                  <path d="M3 10h18M16 14.5h2" />
                </svg>
                <span className="hidden min-[400px]:inline">{d.wc.connectWallet}</span>
              </button>
            )}
          </div>
        </div>

        <nav
          id="mobile-nav"
          dir={dir}
          hidden={!menuOpen}
          aria-label={d.ui.navigation}
          className="border-t border-rule bg-[#060a09]/97 px-4 py-3 backdrop-blur-xl sm:px-6 xl:hidden"
        >
          <div className="mx-auto grid max-w-[1240px] gap-1">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="focus-ring rounded-xl px-3 py-3 text-sm font-medium text-mint transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {walletConnectOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#04100c]/85 px-4 py-8 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeWalletConnect}
          >
            <motion.div
              initial={{ opacity: 0, y: 26, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="panel relative w-full max-w-md rounded-2xl p-7"
              role="dialog"
              aria-modal="true"
            >
              <div className="guilloche pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative">
                <p className="micro text-neon-2">USDC · SPL · SOLANA</p>
                <h2 className="mt-3 text-2xl font-black leading-snug text-white">{d.wc.title}</h2>
                <p className="mt-2 text-sm leading-7 text-mint">{d.wc.body}</p>

                {!user ? (
                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-black/20 px-4 py-3 text-[12px] leading-6 text-mint">
                    <input
                      type="checkbox"
                      checked={form.accept}
                      onChange={(e) => setForm({ ...form, accept: e.target.checked })}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#10e28e]"
                    />
                    <span>
                      {d.header.accept}{" "}
                      <a href={href("/terms")} target="_blank" className="text-neon-2 hover:underline">{d.footer.terms}</a> ·{" "}
                      <a href={href("/privacy")} target="_blank" className="text-neon-2 hover:underline">{d.footer.privacy}</a>
                    </span>
                  </label>
                ) : null}

                <div className="mt-4">
                  <WalletList acceptTerms={form.accept} onDone={closeWalletConnect} />
                </div>

                {!user && botStart ? (
                  <a
                    href={botStart}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#229ED9]/50 px-6 py-3 text-sm font-bold text-[#7cc8ef] transition hover:bg-[#229ED9]/10"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                      <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.6 13.2 1.9 11.7c-1-.3-1-1 .2-1.5L20.6 3c.9-.3 1.6.2 1.3 1.3Z" />
                    </svg>
                    {d.wc.telegramAlt}
                  </a>
                ) : null}

                {!user && !live && demoEnabled ? (
                  <details className="mt-4 rounded-xl border border-dashed border-rule px-4 py-3">
                    <summary className="text-[12px] text-mint hover:text-white">{d.wc.demoAlt}</summary>
                    <form onSubmit={submitDemo} className="mt-3 space-y-3">
                      <Field label={d.header.username} value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="lucky_alex" />
                      <Field label={d.header.referral} value={form.referral} onChange={(v) => setForm({ ...form, referral: v })} placeholder="BETX01" />
                      <button
                        type="submit"
                        dir={dir}
                        aria-busy={busy}
                        disabled={busy || !form.accept}
                        className="btn-neon focus-ring w-full rounded-xl px-6 py-3 text-sm font-bold disabled:opacity-60"
                      >
                        {busy ? d.header.submitting : d.header.submit}
                      </button>
                    </form>
                  </details>
                ) : null}

                <button
                  type="button"
                  dir={dir}
                  onClick={() => {
                    closeWalletConnect();
                    if (!user) setToast(d.header.guestToast);
                  }}
                  className="focus-ring mt-3 w-full rounded-xl px-6 py-2.5 text-xs text-mint transition-colors hover:text-white"
                >
                  {d.header.guest}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className="micro text-mint">{label}</span>
      <input
        value={value}
        dir="ltr"
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring mt-2 w-full rounded-xl border border-rule bg-black/30 px-4 py-3 text-sm text-white placeholder:text-mint/40"
      />
    </label>
  );
}
