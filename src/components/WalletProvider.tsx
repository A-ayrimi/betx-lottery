"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Adapter } from "@tronweb3/tronwallet-abstract-adapter";
import {
  clearDemoSession,
  DEMO_WALLET_ADDRESS,
  loadDemoSession,
} from "@/lib/demoSession";

/**
 * Multi-wallet TRON connector (TronLink, Trust, TokenPocket, OKX, Bitget).
 * Adapters are imported lazily in the browser; missing wallets never deep-link.
 */

export interface WalletOption {
  name: string;
  icon: string;
  readyState: "Loading" | "NotFound" | "Found";
}

interface WalletCtx {
  wallets: WalletOption[];
  ready: boolean;
  address: string | null;
  adapterName: string | null;
  connect: (name: string) => Promise<string>;
  connectDemo: () => string;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  signTransaction: (tx: unknown) => Promise<unknown>;
}

const Ctx = createContext<WalletCtx | null>(null);
const LAST_KEY = "betx_wallet";
const DEMO_ADAPTER_NAME = "Demo wallet";

async function loadAdapters(): Promise<Adapter[]> {
  const [tl, trust, tp, okx, bk] = await Promise.all([
    import("@tronweb3/tronwallet-adapter-tronlink"),
    import("@tronweb3/tronwallet-adapter-trust"),
    import("@tronweb3/tronwallet-adapter-tokenpocket"),
    import("@tronweb3/tronwallet-adapter-okxwallet"),
    import("@tronweb3/tronwallet-adapter-bitkeep"),
  ]);
  const base = { openUrlWhenWalletNotFound: false, openAppWithDeeplink: false };
  return [
    new tl.TronLinkAdapter({ ...base, openTronLinkAppOnMobile: true, dappName: "BETX" }),
    new trust.TrustAdapter(base),
    new tp.TokenPocketAdapter(base),
    new okx.OkxWalletAdapter(base),
    new bk.BitKeepAdapter(base),
  ] as unknown as Adapter[];
}

export function WalletProvider({ children, demoEnabled = false }: { children: ReactNode; demoEnabled?: boolean }) {
  const adaptersRef = useRef<Adapter[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [ready, setReady] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [adapterName, setAdapterName] = useState<string | null>(null);

  const snapshot = useCallback(() => {
    setWallets(
      adaptersRef.current.map((a) => ({
        name: a.name,
        icon: a.icon,
        readyState: a.readyState as WalletOption["readyState"],
      })),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    loadAdapters()
      .then((list) => {
        if (!alive) return;
        adaptersRef.current = list;
        list.forEach((a) => a.on("readyStateChanged", snapshot));
        snapshot();
        setReady(true);
        const demoSession = demoEnabled ? loadDemoSession() : null;
        if (demoSession) {
          window.setTimeout(() => {
            if (!alive) return;
            setAdapterName(DEMO_ADAPTER_NAME);
            setAddress(demoSession.address);
          }, 0);
          return;
        }
        // silent reconnect: only for an injected wallet the user picked before (never deep-links)
        const last = localStorage.getItem(LAST_KEY);
        const prev = list.find((a) => a.name === last);
        const tryReconnect = () => {
          if (prev && prev.readyState === "Found" && !prev.connected) {
            prev
              .connect()
              .then(() => {
                if (!alive || !prev.address) return;
                prev.on("accountsChanged", (addr: string) => setAddress(addr || null));
                prev.on("disconnect", () => {
                  setAddress(null);
                  setAdapterName(null);
                });
                setAdapterName(prev.name);
                setAddress(prev.address);
              })
              .catch(() => {});
          }
        };
        if (prev?.readyState === "Found") tryReconnect();
        else prev?.once("readyStateChanged", tryReconnect);
      })
      .catch((e) => console.error("wallet adapters failed to load", e));
    return () => {
      alive = false;
      adaptersRef.current.forEach((a) => a.removeAllListeners());
    };
  }, [snapshot, demoEnabled]);

  const current = useCallback(() => adaptersRef.current.find((a) => a.name === adapterName) ?? null, [adapterName]);

  const connect = useCallback(
    async (name: string) => {
      const adapter = adaptersRef.current.find((a) => a.name === name);
      if (!adapter) throw new Error("Wallet not available");
      if (adapter.readyState !== "Found") throw new Error("Wallet not found in this browser");
      adapter.removeAllListeners("accountsChanged");
      adapter.removeAllListeners("disconnect");
      await adapter.connect();
      if (!adapter.address) throw new Error("No account selected in wallet");
      adapter.on("accountsChanged", (addr: string) => setAddress(addr || null));
      adapter.on("disconnect", () => {
        setAddress(null);
        setAdapterName(null);
      });
      localStorage.setItem(LAST_KEY, name);
      setAdapterName(name);
      setAddress(adapter.address);
      return adapter.address;
    },
    [],
  );

  const disconnect = useCallback(async () => {
    const a = current();
    localStorage.removeItem(LAST_KEY);
    clearDemoSession();
    setAddress(null);
    setAdapterName(null);
    try {
      await a?.disconnect();
    } catch {
      /* some wallets can't be disconnected programmatically */
    }
  }, [current]);

  const connectDemo = useCallback(() => {
    if (!demoEnabled) throw new Error("Demo wallet is unavailable outside demo mode");
    const active = current();
    if (active?.connected) throw new Error("Disconnect the real wallet before using a test wallet");
    localStorage.removeItem(LAST_KEY);
    setAdapterName(DEMO_ADAPTER_NAME);
    setAddress(DEMO_WALLET_ADDRESS);
    return DEMO_WALLET_ADDRESS;
  }, [current, demoEnabled]);

  const ensure = useCallback(async () => {
    if (adapterName === DEMO_ADAPTER_NAME) {
      throw new Error("Demo wallets cannot sign messages or transactions");
    }
    let a = current();
    if (!a || !a.connected) {
      const name = adapterName || localStorage.getItem(LAST_KEY);
      if (!name) throw new Error("Wallet not connected");
      await connect(name);
      a = adaptersRef.current.find((x) => x.name === name) ?? null;
    }
    if (!a) throw new Error("Wallet not connected");
    return a;
  }, [current, adapterName, connect]);

  const signMessage = useCallback(async (message: string) => (await ensure()).signMessage(message), [ensure]);
  const signTransaction = useCallback(
    async (tx: unknown) => (await ensure()).signTransaction(tx as any),
    [ensure],
  );

  const value = useMemo(
    () => ({ wallets, ready, address, adapterName, connect, connectDemo, disconnect, signMessage, signTransaction }),
    [wallets, ready, address, adapterName, connect, connectDemo, disconnect, signMessage, signTransaction],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used inside WalletProvider");
  return c;
}

export function walletErrorMessage(e: unknown) {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return m.replace(/^Error:\s*/, "").slice(0, 160) || "Wallet error";
}
