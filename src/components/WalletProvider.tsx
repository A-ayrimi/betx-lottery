"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import bs58 from "bs58";
import { isValidSolanaAddress } from "@/lib/solana";
import {
  clearDemoSession,
  DEMO_WALLET_ADDRESS,
  loadDemoSession,
} from "@/lib/demoSession";

export interface WalletOption {
  name: string;
  icon: string;
  readyState: "Loading" | "NotFound" | "Found";
}

interface SolanaProvider {
  isPhantom?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isOkxWallet?: boolean;
  isBitKeep?: boolean;
  isBitget?: boolean;
  isConnected?: boolean;
  publicKey?: { toBase58?: () => string; toString?: () => string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey?: { toBase58?: () => string; toString?: () => string };
  }>;
  disconnect: () => Promise<void>;
  signMessage: (
    message: Uint8Array,
    display?: string
  ) => Promise<Uint8Array | { signature: Uint8Array }>;
  signTransaction?: <T>(tx: T) => Promise<T>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface SolanaWalletDescriptor {
  name: string;
  icon: string;
  getProvider: () => SolanaProvider | null;
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

function extractPubkey(provider: SolanaProvider | null): string | null {
  if (!provider?.publicKey) return null;
  const raw =
    typeof provider.publicKey.toBase58 === "function"
      ? provider.publicKey.toBase58()
      : typeof provider.publicKey.toString === "function"
        ? provider.publicKey.toString()
        : "";
  const clean = String(raw ?? "").trim();
  return isValidSolanaAddress(clean) ? clean : null;
}

function getInjectedSolanaProviders(): SolanaProvider[] {
  if (typeof window === "undefined") return [];
  const w = window as unknown as {
    solana?: SolanaProvider & { providers?: SolanaProvider[] };
    phantom?: { solana?: SolanaProvider };
    trustwallet?: { solana?: SolanaProvider };
    okxwallet?: { solana?: SolanaProvider };
    bitkeep?: { solana?: SolanaProvider };
    bitget?: { solana?: SolanaProvider };
  };

  const list: SolanaProvider[] = [];
  if (Array.isArray(w.solana?.providers)) {
    list.push(...w.solana.providers);
  }
  if (w.phantom?.solana) list.push(w.phantom.solana);
  if (w.trustwallet?.solana) list.push(w.trustwallet.solana);
  if (w.okxwallet?.solana) list.push(w.okxwallet.solana);
  if (w.bitkeep?.solana) list.push(w.bitkeep.solana);
  if (w.bitget?.solana) list.push(w.bitget.solana);
  if (w.solana) list.push(w.solana);

  return Array.from(new Set(list));
}

const WALLET_DESCRIPTORS: SolanaWalletDescriptor[] = [
  {
    name: "Phantom",
    icon: "👻",
    getProvider: () =>
      getInjectedSolanaProviders().find((p) => Boolean(p.isPhantom)) ?? null,
  },
  {
    name: "Trust Wallet",
    icon: "🛡️",
    getProvider: () =>
      getInjectedSolanaProviders().find(
        (p) => Boolean(p.isTrust || p.isTrustWallet)
      ) ?? null,
  },
  {
    name: "OKX Wallet",
    icon: "⚫",
    getProvider: () =>
      getInjectedSolanaProviders().find((p) => Boolean(p.isOkxWallet)) ?? null,
  },
  {
    name: "Bitget Wallet",
    icon: "💠",
    getProvider: () =>
      getInjectedSolanaProviders().find(
        (p) => Boolean(p.isBitget || p.isBitKeep)
      ) ?? null,
  },
];

export function WalletProvider({
  children,
  demoEnabled = false,
}: {
  children: ReactNode;
  demoEnabled?: boolean;
}) {
  const [wallets, setWallets] = useState<WalletOption[]>(() =>
    WALLET_DESCRIPTORS.map((d) => ({
      name: d.name,
      icon: d.icon,
      readyState: "Loading",
    }))
  );
  const ready = wallets.some((w) => w.readyState !== "Loading");
  const [address, setAddress] = useState<string | null>(null);
  const [adapterName, setAdapterName] = useState<string | null>(null);

  const refreshWallets = useCallback(() => {
    setWallets(
      WALLET_DESCRIPTORS.map((d) => ({
        name: d.name,
        icon: d.icon,
        readyState: d.getProvider() ? "Found" : "NotFound",
      }))
    );
  }, []);

  const getDescriptor = useCallback(
    (name: string | null) =>
      WALLET_DESCRIPTORS.find((d) => d.name === name) ?? null,
    []
  );

  useEffect(() => {
    let alive = true;
    const detect = () => {
      if (!alive) return;
      refreshWallets();
    };

    detect();
    const timer = window.setTimeout(detect, 300);
    window.addEventListener("load", detect);

    const demoSession = demoEnabled ? loadDemoSession() : null;
    if (demoSession) {
      window.setTimeout(() => {
        if (!alive) return;
        setAdapterName(DEMO_ADAPTER_NAME);
        setAddress(demoSession.address);
      }, 0);
      return () => {
        alive = false;
        window.clearTimeout(timer);
        window.removeEventListener("load", detect);
      };
    }

    const last = localStorage.getItem(LAST_KEY);
    const prevDesc = WALLET_DESCRIPTORS.find((d) => d.name === last);
    const prevProvider = prevDesc?.getProvider();
    if (prevDesc && prevProvider) {
      prevProvider
        .connect({ onlyIfTrusted: true })
        .then(() => {
          if (!alive) return;
          const pub = extractPubkey(prevProvider);
          if (pub) {
            setAdapterName(prevDesc.name);
            setAddress(pub);
          }
        })
        .catch(() => {});
    }

    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("load", detect);
    };
  }, [demoEnabled, refreshWallets]);

  useEffect(() => {
    if (!adapterName || adapterName === DEMO_ADAPTER_NAME) return;
    const provider = getDescriptor(adapterName)?.getProvider();
    if (!provider?.on) return;

    const handleAccountChanged = (nextPubkey: unknown) => {
      const candidate =
        nextPubkey && typeof nextPubkey === "object"
          ? "toBase58" in nextPubkey &&
            typeof (nextPubkey as { toBase58?: unknown }).toBase58 ===
              "function"
            ? (nextPubkey as { toBase58: () => string }).toBase58()
            : ""
          : String(nextPubkey ?? "");
      const clean = candidate.trim();
      setAddress(isValidSolanaAddress(clean) ? clean : extractPubkey(provider));
    };

    const handleDisconnect = () => {
      setAddress(null);
      setAdapterName(null);
    };

    provider.on("accountChanged", handleAccountChanged);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.off?.("accountChanged", handleAccountChanged);
      provider.off?.("disconnect", handleDisconnect);
      provider.removeListener?.("accountChanged", handleAccountChanged);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [adapterName, getDescriptor]);

  const connect = useCallback(
    async (name: string) => {
      const desc = getDescriptor(name);
      const provider = desc?.getProvider();
      if (!desc) throw new Error("Wallet not available");
      if (!provider) throw new Error("Wallet not found in this browser");

      await provider.connect();
      const pub = extractPubkey(provider);
      if (!pub) throw new Error("No valid Solana account selected in wallet");

      localStorage.setItem(LAST_KEY, name);
      setAdapterName(name);
      setAddress(pub);
      refreshWallets();
      return pub;
    },
    [getDescriptor, refreshWallets]
  );

  const disconnect = useCallback(async () => {
    const provider = getDescriptor(adapterName)?.getProvider();
    localStorage.removeItem(LAST_KEY);
    clearDemoSession();
    setAddress(null);
    setAdapterName(null);
    try {
      await provider?.disconnect();
    } catch {
      // برخی کیف‌پول‌ها قطع ارتباط برنامه‌نویسی را نادیده می‌گیرند
    }
  }, [adapterName, getDescriptor]);

  const connectDemo = useCallback(() => {
    if (!demoEnabled) {
      throw new Error("Demo wallet is unavailable outside demo mode");
    }
    if (address && adapterName !== DEMO_ADAPTER_NAME) {
      throw new Error("Disconnect the real wallet before using a test wallet");
    }
    localStorage.removeItem(LAST_KEY);
    setAdapterName(DEMO_ADAPTER_NAME);
    setAddress(DEMO_WALLET_ADDRESS);
    return DEMO_WALLET_ADDRESS;
  }, [demoEnabled, address, adapterName]);

  const ensureProvider = useCallback(async () => {
    if (adapterName === DEMO_ADAPTER_NAME) {
      throw new Error("Demo wallets cannot sign messages or transactions");
    }
    const targetName = adapterName || localStorage.getItem(LAST_KEY);
    if (!targetName) throw new Error("Wallet not connected");
    const desc = getDescriptor(targetName);
    const provider = desc?.getProvider();
    if (!provider) throw new Error("Wallet not found in this browser");

    if (!provider.isConnected || !extractPubkey(provider)) {
      await connect(targetName);
    }
    return provider;
  }, [adapterName, getDescriptor, connect]);

  const signMessage = useCallback(
    async (message: string) => {
      const provider = await ensureProvider();
      const encoded = new TextEncoder().encode(message);
      const signed = await provider.signMessage(encoded, "utf8");
      const sigBytes =
        signed instanceof Uint8Array ? signed : signed?.signature;
      if (!(sigBytes instanceof Uint8Array) || sigBytes.length === 0) {
        throw new Error("Invalid signature returned by wallet");
      }
      return bs58.encode(sigBytes);
    },
    [ensureProvider]
  );

  const signTransaction = useCallback(
    async (tx: unknown) => {
      const provider = await ensureProvider();
      if (typeof provider.signTransaction !== "function") {
        throw new Error("Wallet does not support transaction signing");
      }
      return provider.signTransaction(tx);
    },
    [ensureProvider]
  );

  const modeMatchesWallet = (adapterName === DEMO_ADAPTER_NAME) === demoEnabled;
  const value = useMemo(
    () => ({
      wallets,
      ready,
      address: modeMatchesWallet ? address : null,
      adapterName: modeMatchesWallet ? adapterName : null,
      connect,
      connectDemo,
      disconnect,
      signMessage,
      signTransaction,
    }),
    [
      wallets,
      ready,
      address,
      adapterName,
      modeMatchesWallet,
      connect,
      connectDemo,
      disconnect,
      signMessage,
      signTransaction,
    ]
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