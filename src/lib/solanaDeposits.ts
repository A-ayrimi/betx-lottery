import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { creditDeposit } from "@/lib/store";
import { notifyDeposit, sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";
import { getSolanaConfig } from "@/lib/solana";

const USDC_DECIMALS = 6;
const USDC_SCALE = BigInt("1000000");

type UsdcTransfer = {
  from: string;
  to: string;
  rawAmount: bigint;
};

type LookupResult =
  | { status: "pending" | "not_found" }
  | {
      status: "confirmed";
      transfers: UsdcTransfer[];
    };

function fromUsdcUnits(units: bigint): number {
  const whole = units / USDC_SCALE;
  const frac = units % USDC_SCALE;
  const num = Number(`${whole.toString()}.${frac.toString().padStart(USDC_DECIMALS, "0")}`);
  return Number.isFinite(num) ? num : 0;
}

function rpcUrl(): string {
  return getSolanaConfig().rpcUrl;
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: T; error?: unknown };
  if (data.error) return null;
  return data.result ?? null;
}

async function lookupSolanaUsdcTransfers(signature: string): Promise<LookupResult> {
  const sig = signature ? signature.trim() : "";
  if (!sig) return { status: "not_found" };

  try {
    const statusResp = await rpcCall<{
      value?: Array<{ err?: unknown } | null>;
    }>("getSignatureStatuses", [[sig], { searchTransactionHistory: true }]);

    const sigStatus = statusResp && statusResp.value ? statusResp.value[0] : null;
    if (!sigStatus) {
      return { status: "not_found" };
    }
    if (sigStatus.err) {
      return { status: "not_found" };
    }

    const tx = await rpcCall<{
      meta?: {
        err?: unknown;
        preTokenBalances?: Array<{
          accountIndex: number;
          mint?: string;
          owner?: string;
          uiTokenAmount?: { amount?: string };
        }>;
        postTokenBalances?: Array<{
          accountIndex: number;
          mint?: string;
          owner?: string;
          uiTokenAmount?: { amount?: string };
        }>;
      };
      transaction?: {
        message?: {
          accountKeys?: Array<string | { pubkey?: string }>;
        };
      };
    }>("getTransaction", [
      sig,
      {
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      },
    ]);

    if (!tx) {
      return { status: "pending" };
    }
    if (tx.meta && tx.meta.err) {
      return { status: "not_found" };
    }

    const rawKeys =
      (tx.transaction &&
        tx.transaction.message &&
        tx.transaction.message.accountKeys) ||
      [];
    const accountKeys = rawKeys.map((k) => {
      if (typeof k === "string") return k;
      return k && k.pubkey ? String(k.pubkey) : "";
    });

    const { usdcMint, treasuryAddress } = getSolanaConfig();
    if (!treasuryAddress) {
      return { status: "not_found" };
    }

    const transfers: UsdcTransfer[] = [];
    const preBalances = (tx.meta && tx.meta.preTokenBalances) || [];
    const postBalances = (tx.meta && tx.meta.postTokenBalances) || [];

    const byKey = new Map<
      string,
      { owner: string; mint: string; pre: bigint; post: bigint }
    >();

    for (const b of preBalances) {
      if (b.mint !== usdcMint) continue;
      const owner = b.owner || accountKeys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const amountStr =
        b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      byKey.set(key, {
        owner,
        mint: b.mint,
        pre: BigInt(amountStr),
        post: BigInt(0),
      });
    }

    for (const b of postBalances) {
      if (b.mint !== usdcMint) continue;
      const owner = b.owner || accountKeys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const existing = byKey.get(key) || {
        owner,
        mint: b.mint,
        pre: BigInt(0),
        post: BigInt(0),
      };
      const amountStr =
        b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      existing.post = BigInt(amountStr);
      byKey.set(key, existing);
    }

    let sender = accountKeys[0] || "";
    let treasuryReceived = BigInt(0);

    for (const entry of Array.from(byKey.values())) {
      const delta = entry.post - entry.pre;
      if (delta < BigInt(0) && entry.owner !== treasuryAddress && entry.owner) {
        sender = entry.owner;
      }
      if (delta > BigInt(0) && entry.owner === treasuryAddress) {
        treasuryReceived += delta;
      }
    }

    if (treasuryReceived > BigInt(0)) {
      transfers.push({
        from: sender,
        to: treasuryAddress,
        rawAmount: treasuryReceived,
      });
    }

    return { status: "confirmed", transfers };
  } catch {
    return { status: "pending" };
  }
}

function sumUsdcTransfers(
  lookup: LookupResult,
  fromAddress: string,
  toAddress: string
): bigint {
  if (lookup.status !== "confirmed") return BigInt(0);
  const fromNorm = fromAddress.trim();
  const toNorm = toAddress.trim();
  let total = BigInt(0);
  for (const t of lookup.transfers) {
    if (t.to !== toNorm) continue;
    if (fromNorm && t.from && t.from !== fromNorm) continue;
    total += t.rawAmount;
  }
  return total;
}

export async function afterCredit(
  result: Awaited<ReturnType<typeof creditDeposit>>,
  amount: number
) {
  if (!result || result.alreadyCredited) return;
  try {
    if (result.user && result.user.telegramId) {
      await notifyDeposit(result.user.telegramId, amount, result.user.locale);
    }
    if (result.inviter && result.inviter.telegramId) {
      await sendMessage(
        result.inviter.telegramId,
        botStrings(result.inviter.locale).refDeposit
      );
    }
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Re-checks a broadcast wallet deposit on Solana mainnet-beta and credits it
 * exactly once. Credits the amount that actually arrived (never more).
 */
export async function settleSolanaDeposit(
  depositId: number
): Promise<{ credited: boolean; status: string } | null> {
  const { treasuryAddress } = getSolanaConfig();
  if (!treasuryAddress) return null;

  const dep = (
    await db.select().from(deposits).where(eq(deposits.id, depositId)).limit(1)
  )[0];
  if (!dep || dep.provider !== "solana") return null;
  if (dep.credited || !dep.txHash || !dep.fromAddress) {
    return { credited: dep.credited, status: dep.status };
  }

  const lookup = await lookupSolanaUsdcTransfers(dep.txHash);
  const mark = (status: string) =>
    db
      .update(deposits)
      .set({ status, updatedAt: new Date() })
      .where(eq(deposits.id, dep.id));

  if (lookup.status === "pending") {
    await mark("pending");
    return { credited: false, status: "pending" };
  }
  if (lookup.status === "not_found") {
    await mark("failed");
    return { credited: false, status: "failed" };
  }

  const units = sumUsdcTransfers(lookup, dep.fromAddress, treasuryAddress);
  if (units <= BigInt(0)) {
    await mark("failed");
    return { credited: false, status: "failed" };
  }

  const amount = fromUsdcUnits(units);
  await db
    .update(deposits)
    .set({
      amountUsd: String(amount),
      provider: "solana",
      payCurrency: "usdc-spl",
      status: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(deposits.id, dep.id));

  const result = await creditDeposit(dep.id, "finished");
  await afterCredit(result, amount);
  return { credited: true, status: "finished" };
}

/**
 * Credits an on-chain SPL-USDC transfer FROM a user's verified wallet that was found by
 * the scanner (no TXID needed). Re-verified on Solana first.
 * Returns false if already known / not genuine.
 */
export async function creditOnchain(userId: number, txid: string, from: string) {
  const { treasuryAddress } = getSolanaConfig();
  if (!treasuryAddress) return false;

  const known = (
    await db.select({ id: deposits.id }).from(deposits).where(eq(deposits.txHash, txid)).limit(1)
  )[0];
  if (known) return false;

  const lookup = await lookupSolanaUsdcTransfers(txid);
  if (lookup.status !== "confirmed") return false;

  const units = sumUsdcTransfers(lookup, from, treasuryAddress);
  if (units <= BigInt(0)) return false;

  const amount = fromUsdcUnits(units);
  let depId: number;
  try {
    depId = (
      await db
        .insert(deposits)
        .values({
          userId,
          provider: "solana",
          orderId: `SCAN-${userId}-${Date.now()}-${randomBytes(3).toString("hex")}`,
          amountUsd: String(amount),
          payCurrency: "usdc-spl",
          status: "confirmed",
          txHash: txid,
          fromAddress: from,
        })
        .returning()
    )[0].id;
  } catch {
    return false; // unique tx_hash: someone else credited it a moment ago
  }

  const result = await creditDeposit(depId, "finished");
  await afterCredit(result, amount);
  return true;
}

