import { config } from "@/lib/config";
import {
  getSolanaUsdcBalance,
  getSolanaConnection,
  isValidSolanaAddress,
  solanaExplorerAddressUrl,
} from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

/**
 * Live, on-chain SPL-USDC balance of the Solana treasury wallet.
 * This is the money that really sits in the address — independent of the
 * internal ledger — so any top-up to the address shows up automatically.
 * Cached briefly per instance to avoid excessive RPC load.
 */

const TTL_MS = 60_000;

export type OnchainStatus = "ok" | "inactive" | "unavailable" | "invalid";

export interface OnchainTreasury {
  address: string;
  network: string;
  status: OnchainStatus;
  usdc: number | null;
  sol: number | null;
  usdt?: number | null;
  trx?: number | null;
  fetchedAt: string;
  explorerUrl: string;
}

let cache: { at: number; value: OnchainTreasury } | null = null;
let inflight: Promise<OnchainTreasury> | null = null;

export function addressExplorerUrl(address: string) {
  return solanaExplorerAddressUrl(address);
}

async function fetchTreasury(): Promise<OnchainTreasury> {
  const address = config.adminWallet;
  const base = {
    address,
    network: "solana",
    fetchedAt: new Date().toISOString(),
    explorerUrl: addressExplorerUrl(address),
  };
  if (!isValidSolanaAddress(address)) return { ...base, status: "invalid", usdc: null, sol: null };
  try {
    const [usdc, lamports] = await Promise.all([
      getSolanaUsdcBalance(address),
      getSolanaConnection().getBalance(new PublicKey(address), "confirmed"),
    ]);
    return { ...base, status: "ok", usdc, sol: lamports / 1e9 };
  } catch {
    return { ...base, status: "unavailable", usdc: null, sol: null };
  }
}

export async function getTreasuryOnchain(force = false): Promise<OnchainTreasury> {
  const now = Date.now();
  // keep serving the last good value briefly if the network blips
  if (!force && cache && now - cache.at < TTL_MS) return cache.value;
  if (inflight) return inflight;
  inflight = fetchTreasury()
    .then((value) => {
      if (value.status !== "unavailable") cache = { at: Date.now(), value };
      else cache = null;
      return value;
    })
    .catch((error: unknown) => {
      cache = null;
      throw error;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
