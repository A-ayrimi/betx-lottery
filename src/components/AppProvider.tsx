"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState, DrawResult } from "@/lib/types";
import { useI18n } from "@/i18n/client";
import { useStored, writeStored } from "@/lib/useStored";
import {
  buyDemoTickets,
  clearDemoSession,
  createDemoState,
  depositDemoBalance,
  isDemoAppState,
  DEMO_WALLET_ADDRESS,
  loadDemoSession,
  saveDemoSession,
  spinDemoWheel,
  withdrawDemoBalance,
} from "@/lib/demoSession";

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
  }
}

interface Ctx {
  state: AppState | null;
  loading: boolean;
  dataUnavailable: boolean;
  toast: string | null;
  draw: DrawResult | null;
  pendingRef: string;
  demoEnabled: boolean;
  isDemoSession: boolean;
  walletConnectOpen: boolean;
  setDraw: (d: DrawResult | null) => void;
  setToast: (t: string | null) => void;
  startDemoSession: (address: string) => void;
  openWalletConnect: () => void;
  closeWalletConnect: () => void;
  refresh: (force?: boolean) => Promise<void>;
  connect: (username: string, telegram: string, referral: string, acceptTerms: boolean) => Promise<boolean>;
  account: (body: Record<string, unknown>) => Promise<boolean>;
  logout: () => Promise<void>;
  buy: (count: number) => Promise<DrawResult | true | "insufficient" | null>;
  spin: () => Promise<{ ok: boolean; index?: number; prize?: number; error?: string }>;
  deposit: (amount: number) => Promise<boolean>;
  withdraw: (amount: number, address: string) => Promise<boolean>;
}

const AppCtx = createContext<Ctx | null>(null);

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({ ok: false, error: "" }));
}

export function AppProvider({
  children,
  initialState = null,
  demoEnabled = false,
}: {
  children: ReactNode;
  initialState?: AppState | null;
  demoEnabled?: boolean;
}) {
  const [state, setState] = useState<AppState | null>(initialState);
  const [loading, setLoading] = useState(!initialState);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [isDemoSession, setIsDemoSession] = useState(false);
  const [walletConnectOpen, setWalletConnectOpen] = useState(false);
  const refreshGeneration = useRef(0);
  const pendingRef = useStored("betx_ref", "") ?? "";
  const { d, t, locale } = useI18n();

  const openWalletConnect = useCallback(() => setWalletConnectOpen(true), []);
  const closeWalletConnect = useCallback(() => setWalletConnectOpen(false), []);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    if (demoEnabled) {
      const saved = loadDemoSession();
      if (saved) {
        setState(saved.state);
        setIsDemoSession(true);
        setDataUnavailable(false);
        setLoading(false);
        return;
      }
      setState(null);
      setIsDemoSession(false);
      setDataUnavailable(false);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const json = await res.json();
      if (generation !== refreshGeneration.current) return;
      if (!res.ok || !json.ok || !json.state || typeof json.state !== "object") {
        setState(null);
        setDataUnavailable(true);
        return;
      }
      setState(json.state);
      setDataUnavailable(false);
    } catch {
      if (generation === refreshGeneration.current) {
        setState(null);
        setDataUnavailable(true);
      }
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [demoEnabled]);

  const startDemoSession = useCallback(
    (address: string) => {
      if (!demoEnabled || address !== DEMO_WALLET_ADDRESS) {
        throw new Error("Demo wallet is unavailable outside demo mode");
      }
      const next = createDemoState(address, locale);
      saveDemoSession(next);
      setState(next);
      setIsDemoSession(true);
      setDataUnavailable(false);
      setLoading(false);
    },
    [demoEnabled, locale],
  );

  // URL flags: ?ref=CODE, ?login=ok|expired|soon, ?deposit=success|cancel
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (ref && /^[A-Z0-9]{4,16}$/i.test(ref)) writeStored("betx_ref", ref.toUpperCase());

    const login = url.searchParams.get("login");
    const dep = url.searchParams.get("deposit");
    const msg =
      login === "ok" ? d.toast.loginOk
      : login === "expired" ? d.toast.loginExpired
      : login === "soon" ? d.wc.comingSoonToast
      : dep === "success" ? d.toast.depositSuccess
      : dep === "cancel" ? d.toast.depositCancel
      : null;
    if (ref || login || dep) {
      ["ref", "login", "deposit"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (!msg) return;
    const id = window.setTimeout(() => setToast(msg), 0);
    return () => window.clearTimeout(id);
  }, [d]);

  // Telegram Mini App: silent sign-in with signed initData
  useEffect(() => {
    if (demoEnabled) return;
    let tries = 0;
    const t = window.setInterval(async () => {
      tries++;
      const wa = window.Telegram?.WebApp;
      if (wa?.initData) {
        window.clearInterval(t);
        wa.ready?.();
        wa.expand?.();
        if (state?.user) return;
        const json = await post("/api/auth/telegram", { initData: wa.initData });
        if (json.ok) {
          await refresh();
          setToast(json.created ? d.toast.tgCreated : d.toast.welcomeBack);
        }
      } else if (tries > 10) {
        window.clearInterval(t);
      }
    }, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoEnabled]);

  useEffect(() => {
    if (demoEnabled) {
      const saved = loadDemoSession();
      if (saved) {
        const id = window.setTimeout(() => {
          setState(saved.state);
          setIsDemoSession(true);
          setLoading(false);
        }, 0);
        return () => window.clearTimeout(id);
      }
    }
    if (initialState) return;
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [demoEnabled, refresh, initialState]);

  // light polling keeps the pool meter honest while the tab is visible
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 15000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4600);
    return () => clearTimeout(t);
  }, [toast]);

  const connect = useCallback(
    async (username: string, telegram: string, referral: string, acceptTerms: boolean) => {
      const json = await post("/api/auth/connect", { username, telegram, referral, acceptTerms });
      if (!json.ok) {
        setToast(json.error || d.toast.connectFail);
        return false;
      }
      writeStored("betx_ref", null);
      await refresh();
      setToast(d.toast.welcome);
      return true;
    },
    [refresh, d],
  );

  const account = useCallback(
    async (body: Record<string, unknown>) => {
      if (isDemoSession && state && isDemoAppState(state) && state.user) {
        let nextUser = state.user;
        if (body.action === "self_exclude") {
          const days = Number(body.days);
          if (!Number.isFinite(days) || days < 1) return false;
          nextUser = {
            ...nextUser,
            selfExcludedUntil: new Date(Date.now() + days * 86_400_000).toISOString(),
          };
        } else if (body.action === "deposit_limit") {
          const amount = body.amount === null ? null : Number(body.amount);
          if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return false;
          nextUser = { ...nextUser, depositLimit: amount, pendingLimit: null };
        } else {
          return false;
        }
        const next = { ...state, user: nextUser };
        saveDemoSession(next);
        setState(next);
        return true;
      }
      const json = await post("/api/account", body);
      if (!json.ok) {
        setToast(json.error || d.toast.invalid);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, d, isDemoSession, state],
  );

  const logout = useCallback(async () => {
    if (isDemoSession) {
      clearDemoSession();
      setState(null);
      setIsDemoSession(false);
      setDataUnavailable(false);
      setToast(d.toast.loggedOut);
      return;
    }
    await post("/api/auth/logout");
    await refresh();
    setToast(d.toast.loggedOut);
  }, [refresh, d, isDemoSession]);

  const buy = useCallback(
    async (count: number) => {
      if (isDemoSession && state && isDemoAppState(state)) {
        const result = buyDemoTickets(state, count);
        if (result.error === "insufficient") {
          setToast(d.toast.buyFail);
          return "insufficient" as const;
        }
        if (result.error) {
          setToast(d.toast.buyFail);
          return null;
        }
        saveDemoSession(result.state);
        setState(result.state);
        if (result.draw) {
          setDraw(result.draw);
          return result.draw;
        }
        setToast(t(d.toast.ticketsAdded, { n: result.serials.length }));
        return true as const;
      }
      let json;
      try {
        json = await post("/api/tickets/buy", { count });
      } catch {
        setToast(d.toast.buyFail);
        return null;
      }
      if (!json.ok) {
        setToast(json.error || d.toast.buyFail);
        return json.code === "insufficient" ? "insufficient" : null;
      }
      await refresh();
      if (json.draw) {
        setDraw(json.draw);
        return json.draw as DrawResult;
      }
      setToast(t(d.toast.ticketsAdded, { n: json.serials?.length ?? count }));
      return true as const;
    },
    [refresh, d, t, isDemoSession, state],
  );

  const spin = useCallback(async () => {
    if (isDemoSession && state && isDemoAppState(state)) {
      const result = spinDemoWheel(state);
      if (!result.ok) {
        setToast(d.toast.spinFail);
        return { ok: false as const, error: result.error };
      }
      saveDemoSession(result.state);
      setState(result.state);
      return { ok: true as const, index: result.index, prize: result.prize };
    }
    let json;
    try {
      json = await post("/api/wheel/spin");
    } catch {
      setToast(d.toast.spinFail);
      return { ok: false as const, error: d.toast.spinFail };
    }
    if (!json.ok) {
      setToast(json.error || d.toast.spinFail);
      return { ok: false as const, error: json.error };
    }
    return { ok: true as const, index: json.index as number, prize: json.prize as number };
  }, [d, isDemoSession, state]);

  const deposit = useCallback(
    async (amount: number) => {
      if (isDemoSession && state && isDemoAppState(state)) {
        const next = depositDemoBalance(state, amount);
        if (!next) {
          setToast(d.toast.payFail);
          return false;
        }
        saveDemoSession(next);
        setState(next);
        setToast(t(d.toast.demoCredited, { amount: `$${Number(amount).toFixed(2)}` }));
        return true;
      }
      const json = await post("/api/payments/deposit", { amount, idempotencyKey: crypto.randomUUID() });
      if (!json.ok) {
        setToast(json.error || d.toast.payFail);
        return false;
      }
      if (json.invoiceUrl) {
        window.location.href = json.invoiceUrl;
        return true;
      }
      await refresh();
      setToast(t(d.toast.demoCredited, { amount: `$${Number(json.credited).toFixed(2)}` }));
      return true;
    },
    [refresh, d, t, isDemoSession, state],
  );

  const withdraw = useCallback(
    async (amount: number, address: string) => {
      if (isDemoSession && state && isDemoAppState(state)) {
        const next = withdrawDemoBalance(state, amount, address);
        if (!next) {
          setToast(d.toast.wdFail);
          return false;
        }
        saveDemoSession(next);
        setState(next);
        setToast(d.wallet.demoWithdrawalSaved);
        return true;
      }
      const json = await post("/api/payments/withdraw", { amount, address });
      if (!json.ok) {
        setToast(json.error || d.toast.wdFail);
        return false;
      }
      await refresh();
      setToast(t(d.toast.wdOk, { id: json.id }));
      return true;
    },
    [refresh, d, t, isDemoSession, state],
  );

  const value = useMemo(
    () => ({
      state,
      loading,
      dataUnavailable,
      toast,
      draw,
      pendingRef,
      demoEnabled,
      isDemoSession,
      walletConnectOpen,
      setDraw,
      setToast,
      startDemoSession,
      openWalletConnect,
      closeWalletConnect,
      refresh,
      connect,
      account,
      logout,
      buy,
      spin,
      deposit,
      withdraw,
    }),
    [
      state,
      loading,
      dataUnavailable,
      toast,
      draw,
      pendingRef,
      demoEnabled,
      isDemoSession,
      walletConnectOpen,
      startDemoSession,
      openWalletConnect,
      closeWalletConnect,
      refresh,
      connect,
      account,
      logout,
      buy,
      spin,
      deposit,
      withdraw,
    ],
  );

  return (
    <AppCtx.Provider value={value}>
      {dataUnavailable ? (
        <div
          role="alert"
          aria-live="assertive"
          className="border-b border-red-500/30 bg-red-950 px-4 py-3 text-center text-sm text-red-100"
        >
          {d.errors.unavailable}
        </div>
      ) : null}
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
