"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Adapter } from "@tronweb3/tronwallet-abstract-adapter";

/**
 * Multi-wallet TRON connector (TronLink, Trust, TokenPocket, OKX, Bitget).
 * Adapters are imported lazily in the browser only. On mobile, connecting to a
 * wallet that isn't injected deep-links into that wallet's in-app browser.
 */

export interface WalletOption {
  name: string;
  icon: string;
  url: string;
  readyState: "Loading" | "NotFound" | "Found";
}

interface WalletCtx {
  wallets: WalletOption[];
  ready: boolean;
  address: string | null;
  adapterName: string | null;
  connect: (name: string) => Promise<string>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  signTransaction: (tx: unknown) => Promise<unknown>;
}

const Ctx = createContext<WalletCtx | null>(null);
const LAST_KEY = "betx_wallet";

async function loadAdapters(): Promise<Adapter[]> {
  const [tl, trust, tp, okx, bk] = await Promise.all([
    import("@tronweb3/tronwallet-adapter-tronlink"),
    import("@tronweb3/tronwallet-adapter-trust"),
    import("@tronweb3/tronwallet-adapter-tokenpocket"),
    import("@tronweb3/tronwallet-adapter-okxwallet"),
    import("@tronweb3/tronwallet-adapter-bitkeep"),
  ]);
  const base = { openUrlWhenWalletNotFound: false, openAppWithDeeplink: true };
  return [
    new tl.TronLinkAdapter({ ...base, openTronLinkAppOnMobile: true, dappName: "BETX" }),
    new trust.TrustAdapter(base),
    new tp.TokenPocketAdapter(base),
    new okx.OkxWalletAdapter(base),
    new bk.BitKeepAdapter(base),
  ] as unknown as Adapter[];
}

export function WalletProvider({ children }: { children: ReactNode }) {
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
        url: a.url,
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
  }, [snapshot]);

  const current = useCallback(() => adaptersRef.current.find((a) => a.name === adapterName) ?? null, [adapterName]);

  const connect = useCallback(
    async (name: string) => {
      const adapter = adaptersRef.current.find((a) => a.name === name);
      if (!adapter) throw new Error("Wallet not available");
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
    setAddress(null);
    setAdapterName(null);
    try {
      await a?.disconnect();
    } catch {
      /* some wallets can't be disconnected programmatically */
    }
  }, [current]);

  const ensure = useCallback(async () => {
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
    () => ({ wallets, ready, address, adapterName, connect, disconnect, signMessage, signTransaction }),
    [wallets, ready, address, adapterName, connect, disconnect, signMessage, signTransaction],
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
