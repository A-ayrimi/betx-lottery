import { config } from "@/lib/config";
import { getBalances, isTronAddress, tron } from "@/lib/tron";

/**
 * Live, on-chain balance of the treasury wallet (ADMIN_WALLET) on TRON.
 * This is the money that really sits in the address — independent of the
 * internal ledger — so any top-up to the address shows up automatically.
 * Cached briefly per instance to respect TronGrid rate limits.
 */

const TTL_MS = 60_000;

export type OnchainStatus = "ok" | "inactive" | "unavailable" | "invalid";

export interface OnchainTreasury {
  address: string;
  network: string;
  status: OnchainStatus;
  usdt: number | null;
  trx: number | null;
  fetchedAt: string;
  explorerUrl: string;
}

let cache: { at: number; value: OnchainTreasury } | null = null;
let inflight: Promise<OnchainTreasury> | null = null;

export function addressExplorerUrl(address: string) {
  return tron.explorer.replace(/transaction\/?$/, "address/") + address;
}

async function fetchTreasury(): Promise<OnchainTreasury> {
  const address = config.adminWallet;
  const base = {
    address,
    network: tron.network,
    fetchedAt: new Date().toISOString(),
    explorerUrl: addressExplorerUrl(address),
  };
  if (!isTronAddress(address)) return { ...base, status: "invalid", usdt: null, trx: null };
  const bal = await getBalances(address);
  if (!bal) return { ...base, status: "unavailable", usdt: null, trx: null };
  if (!bal.activated) return { ...base, status: "inactive", usdt: 0, trx: 0 };
  return { ...base, status: "ok", usdt: bal.usdt, trx: bal.trx };
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
