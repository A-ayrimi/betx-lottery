import { TronWeb } from "tronweb";
import { getBetxMode } from "./config.ts";

/**
 * TRON / USDT-TRC20 integration (server-only).
 * The server never holds a private key: it builds unsigned transactions,
 * the user's wallet signs them, and payments are verified on-chain.
 */

const NETWORKS = {
  mainnet: {
    api: "https://api.trongrid.io",
    usdt: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    explorer: "https://tronscan.org/#/transaction/",
  },
  nile: {
    api: "https://nile.trongrid.io",
    usdt: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
    explorer: "https://nile.tronscan.org/#/transaction/",
  },
  shasta: {
    api: "https://api.shasta.trongrid.io",
    usdt: "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
    explorer: "https://shasta.tronscan.org/#/transaction/",
  },
} as const;

type Network = keyof typeof NETWORKS;

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** fee cap for a USDT transfer (in SUN). 100 TRX is a safe ceiling; real cost is far lower. */
export const FEE_LIMIT_SUN = 100_000_000;

export const tron = {
  get network(): Network {
    const n = process.env.TRON_NETWORK;
    return n === "nile" || n === "shasta" ? n : "mainnet";
  },
  get api() {
    return (process.env.TRON_API_URL || NETWORKS[this.network].api).replace(/\/$/, "");
  },
  get usdt() {
    return process.env.TRON_USDT_CONTRACT || NETWORKS[this.network].usdt;
  },
  get decimals() {
    return Number(process.env.TRON_USDT_DECIMALS || 6);
  },
  get depositAddress() {
    return (process.env.TRON_DEPOSIT_ADDRESS || process.env.ADMIN_WALLET || "").trim();
  },
  get apiKey() {
    return process.env.TRONGRID_API_KEY || "";
  },
  get explorer() {
    return NETWORKS[this.network].explorer;
  },
  /** Direct wallet deposits are on when a valid receiving address is configured. */
  get enabled() {
    return isTronAddress(this.depositAddress);
  },
};

let client: TronWeb | null = null;
function tw() {
  if (!client) {
    client = new TronWeb({
      fullHost: tron.api,
      headers: tron.apiKey ? { "TRON-PRO-API-KEY": tron.apiKey } : undefined,
    });
  }
  return client;
}

export function isTronAddress(a: unknown): a is string {
  return typeof a === "string" && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) && TronWeb.isAddress(a);
}

export const isTxId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);

export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function isTronBroadcastAuthorized() {
  try {
    return getBetxMode() === "live" && process.env.TRON_BROADCAST_ENABLED === "true";
  } catch {
    return false;
  }
}

/** USD (2 decimals) -> token base units, without floating point drift. */
export function toUnits(amountUsd: number): bigint {
  const cents = BigInt(Math.round(amountUsd * 100));
  return cents * BigInt(10) ** BigInt(tron.decimals - 2);
}

/** token base units -> USD, floored to cents. */
export function fromUnits(units: bigint): number {
  const cents = units / BigInt(10) ** BigInt(tron.decimals - 2);
  return Number(cents) / 100;
}

/* ------------------------------------------------------------ sign-in */

export function buildLoginMessage(p: { address: string; nonce: string; uri: string; issuedAt: Date; expiresAt: Date }) {
  return [
    "BETX wants you to sign in with your TRON account:",
    p.address,
    "",
    "Sign in to BETX. This is free and does not send a transaction.",
    "",
    `URI: ${p.uri}`,
    `Network: ${tron.network}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt.toISOString()}`,
    `Expiration Time: ${p.expiresAt.toISOString()}`,
  ].join("\n");
}

/** Returns the base58 address that produced `signature` (TIP-191 / signMessageV2), or null. */
export async function recoverSigner(message: string, signature: string): Promise<string | null> {
  if (typeof signature !== "string" || !/^(0x)?[0-9a-f]{130}$/i.test(signature)) return null;
  try {
    const addr = await tw().trx.verifyMessageV2(message, signature);
    return isTronAddress(addr) ? addr : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------- transactions */

export async function buildUsdtTransfer(from: string, to: string, amountUsd: number) {
  const res = await tw().transactionBuilder.triggerSmartContract(
    tron.usdt,
    "transfer(address,uint256)",
    { feeLimit: FEE_LIMIT_SUN, callValue: 0 },
    [
      { type: "address", value: to },
      { type: "uint256", value: toUnits(amountUsd).toString() },
    ],
    from,
  );
  if (!res?.result?.result || !res.transaction?.txID) {
    throw new Error(`triggerSmartContract failed: ${JSON.stringify(res?.result ?? res).slice(0, 200)}`);
  }
  return res.transaction;
}

function decodeMessage(m: unknown) {
  if (typeof m !== "string") return "";
  if (/^[0-9a-f]+$/i.test(m) && m.length % 2 === 0) {
    try {
      return Buffer.from(m, "hex").toString("utf8");
    } catch {
      return m;
    }
  }
  return m;
}

export async function broadcast(
  signed: unknown,
  sendRawTransaction: (transaction: unknown) => Promise<unknown> = (transaction) =>
    tw().trx.sendRawTransaction(transaction as never),
): Promise<{ ok: boolean; txid: string | null; error?: string }> {
  if (!isTronBroadcastAuthorized()) {
    return { ok: false, txid: null, error: "Live TRON broadcast authorization is disabled." };
  }
  try {
    const response = await sendRawTransaction(signed);
    const r = response && typeof response === "object" ? response as Record<string, unknown> : null;
    if (r?.result) {
      const transaction = r.transaction && typeof r.transaction === "object"
        ? r.transaction as Record<string, unknown>
        : null;
      const txid = typeof r.txid === "string" ? r.txid : typeof transaction?.txID === "string" ? transaction.txID : null;
      return { ok: true, txid };
    }
    const code = typeof r?.code === "string" ? r.code : "ERROR";
    return { ok: false, txid: null, error: `${code} ${decodeMessage(r?.message)}`.trim() };
  } catch (e) {
    return { ok: false, txid: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** fetch with timeout + one retry on 429/5xx/network errors */
async function grid(path: string, init?: RequestInit) {
  const headers = { "Content-Type": "application/json", ...(tron.apiKey ? { "TRON-PRO-API-KEY": tron.apiKey } : {}) };
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${tron.api}${path}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`TronGrid ${path} ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`TronGrid ${path} ${res.status}`), { fatal: true });
      return res.json();
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const post = (path: string, body: unknown) => grid(path, { method: "POST", body: JSON.stringify(body) });

export interface UsdtTransfer {
  from: string;
  to: string;
  units: bigint;
}

export type TransferLookup =
  | { status: "pending" }
  | { status: "failed"; reason: string }
  | { status: "confirmed"; transfers: UsdtTransfer[]; blockTime: number };

/**
 * Reads a transaction from the *solidified* chain and extracts genuine
 * USDT Transfer events. Only logs emitted by the real USDT contract count —
 * a fake token emitting a look-alike "Transfer" event is ignored.
 */
export async function lookupUsdtTransfers(txid: string): Promise<TransferLookup> {
  const info: any = await post("/walletsolidity/gettransactioninfobyid", { value: txid });
  if (!info || !info.id) return { status: "pending" };
  if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
    return { status: "failed", reason: info.receipt.result };
  }
  const usdtHex = TronWeb.address.toHex(tron.usdt).toLowerCase().replace(/^41/, "");
  const transfers: UsdtTransfer[] = [];
  for (const log of info.log ?? []) {
    if (String(log.address).toLowerCase() !== usdtHex) continue;
    const topics: string[] = log.topics ?? [];
    if (topics.length < 3 || topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    transfers.push({
      from: TronWeb.address.fromHex("41" + topics[1].slice(-40)),
      to: TronWeb.address.fromHex("41" + topics[2].slice(-40)),
      units: BigInt("0x" + (log.data || "0")),
    });
  }
  return { status: "confirmed", transfers, blockTime: Number(info.blockTimeStamp || 0) };
}

/** Sum of USDT sent from `from` to `to` inside a confirmed lookup. */
export function sumTransfers(lookup: TransferLookup, from: string, to: string): bigint {
  if (lookup.status !== "confirmed") return BigInt(0);
  return lookup.transfers.filter((t) => t.from === from && t.to === to).reduce((a, t) => a + t.units, BigInt(0));
}

/** USDT + TRX balance of an address (for display only). */
export async function getBalances(address: string) {
  try {
    const j = await grid(`/v1/accounts/${address}`);
    const acct = j?.data?.[0];
    if (!acct) return { usdt: 0, trx: 0, activated: false };
    let units = BigInt(0);
    for (const entry of acct.trc20 ?? []) {
      if (entry[tron.usdt]) units = BigInt(entry[tron.usdt]);
    }
    return { usdt: fromUnits(units), trx: Number(acct.balance || 0) / 1e6, activated: true };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------ automation helpers */

export interface IncomingTransfer {
  txid: string;
  from: string;
  units: bigint;
  blockTime: number;
}

/** Confirmed USDT transfers INTO `address` since `sinceMs` (oldest first). */
export async function listIncomingUsdt(address: string, sinceMs: number): Promise<IncomingTransfer[]> {
  const qs = new URLSearchParams({
    only_to: "true",
    only_confirmed: "true",
    limit: "200",
    contract_address: tron.usdt,
    min_timestamp: String(Math.max(0, Math.floor(sinceMs))),
    order_by: "block_timestamp,asc",
  });
  const j = await grid(`/v1/accounts/${address}/transactions/trc20?${qs}`);
  return ((j?.data ?? []) as any[])
    .filter((x) => x.to === address && x.token_info?.address === tron.usdt && x.type === "Transfer" && isTxId(x.transaction_id))
    .map((x) => ({ txid: String(x.transaction_id), from: String(x.from), units: BigInt(x.value), blockTime: Number(x.block_timestamp) }));
}

/** Address of a hot-wallet key, or null if the key is malformed. */
export function addressFromKey(privateKey: string): string | null {
  if (!/^[0-9a-f]{64}$/i.test(privateKey)) return null;
  const a = TronWeb.address.fromPrivateKey(privateKey);
  return typeof a === "string" && isTronAddress(a) ? a : null;
}

export async function signWithKey(transaction: unknown, privateKey: string) {
  return tw().trx.sign(transaction as any, privateKey);
}
