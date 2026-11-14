import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeTransfers, rounds, vault } from "@/db/schema";
import { config } from "@/lib/config";
import {
  addressFromKey,
  broadcast,
  buildUsdtTransfer,
  getBalances,
  lookupUsdtTransfers,
  signWithKey,
  toUnits,
  tron,
} from "@/lib/tron";

/**
 * Automatic $5 fee settlement to the admin treasury wallet.
 *
 * Every draw INSTANTLY accrues the fee (vault balance + adminEarnings +
 * fee_transfers row) inside the draw transaction — no admin click, no delay.
 * This module then settles accrued fees on-chain when a hot wallet is
 * configured (AUTO_FEE_PAYOUT=on). Otherwise fees stay `accrued` (fully
 * accounted, visible in /admin) until the operator pays manually and records
 * the tx hash.
 *
 * Exactly-once: a transfer moves to `processing` with the tx id BEFORE
 * broadcast, becomes `paid` only when seen on the solidified chain, and
 * returns to `accrued` only after the signed tx has provably expired.
 */

const EXPIRE_MS = 10 * 60 * 1000;
const MIN_TRX_FOR_FEES = 30;

export function feeConfig() {
  const key = process.env.TRON_PAYOUT_PRIVATE_KEY || "";
  const hot = key ? addressFromKey(key) : null;
  return {
    enabled: config.fees.autoSweep && Boolean(hot) && tron.enabled,
    keyConfigured: Boolean(key),
    keyValid: Boolean(hot),
    hotWallet: hot,
    adminWallet: config.adminWallet,
    threshold: config.fees.sweepThreshold,
    max: config.fees.sweepMax,
  };
}

export async function feeQueue() {
  const rows = await db
    .select()
    .from(feeTransfers)
    .where(inArray(feeTransfers.status, ["accrued", "queued", "processing", "failed"]))
    .orderBy(feeTransfers.id)
    .limit(50);
  const [agg] = await db
    .select({
      pending: sql<string>`coalesce(sum(case when ${feeTransfers.status} in ('accrued','queued','processing','failed') then ${feeTransfers.amount} else 0 end),0)`,
      paid: sql<string>`coalesce(sum(case when ${feeTransfers.status} = 'paid' then ${feeTransfers.amount} else 0 end),0)`,
    })
    .from(feeTransfers);
  return { rows, pending: Number(agg.pending), paid: Number(agg.paid) };
}

/** Move `processing` fee transfers forward based on the chain. */
export async function finalizeFeeProcessing(alert: (key: string, text: string) => Promise<void>) {
  const list = await db.select().from(feeTransfers).where(eq(feeTransfers.status, "processing"));
  let paid = 0, reverted = 0;
  for (const f of list) {
    if (!f.expectedTxId) continue;
    const lk = await lookupUsdtTransfers(f.expectedTxId);
    if (lk.status === "confirmed") {
      const units = lk.transfers.filter((t) => t.to === f.adminWallet).reduce((a, t) => a + t.units, BigInt(0));
      if (units >= toUnits(Number(f.amount))) {
        await db.transaction(async (tx) => {
          await tx
            .update(feeTransfers)
            .set({ status: "paid", txHash: f.expectedTxId, paidAt: new Date(), lastError: null })
            .where(and(eq(feeTransfers.id, f.id), eq(feeTransfers.status, "processing")));
          await tx.update(vault).set({
            adminPaid: sql`${vault.adminPaid} + ${f.amount}`,
            updatedAt: new Date(),
          });
          await tx
            .update(rounds)
            .set({ feeStatus: "paid", feeTxHash: f.expectedTxId, feePaidAt: new Date() })
            .where(eq(rounds.id, f.roundId));
        });
        paid++;
      } else {
        await alert(
          `fee-mismatch-${f.id}`,
          `🚨 Fee #${f.id} (round ${f.roundId}): tx confirmed but amount mismatch. Check: ${tron.explorer}${f.expectedTxId}`,
        );
      }
    } else if (lk.status === "failed") {
      await db
        .update(feeTransfers)
        .set({ status: "accrued", expectedTxId: null, lastError: `on-chain failed (${lk.reason}); will retry` })
        .where(and(eq(feeTransfers.id, f.id), eq(feeTransfers.status, "processing")));
      reverted++;
    } else {
      const age = Date.now() - new Date(f.createdAt).getTime();
      // processing rows older than EXPIRE_MS past their last attempt → safe to retry
      if (age > EXPIRE_MS * 6) {
        await db
          .update(feeTransfers)
          .set({ status: "accrued", expectedTxId: null, lastError: "tx expired; will retry" })
          .where(and(eq(feeTransfers.id, f.id), eq(feeTransfers.status, "processing")));
        reverted++;
      }
    }
  }
  return { paid, reverted };
}

export async function processFeeSweeps(alert: (key: string, text: string) => Promise<void>) {
  const finalized = await finalizeFeeProcessing(alert);
  const cfg = feeConfig();
  if (!cfg.enabled || !cfg.hotWallet) {
    if (config.fees.autoSweep && cfg.keyConfigured && !cfg.keyValid) {
      await alert("fee-key", "🚨 TRON_PAYOUT_PRIVATE_KEY is malformed — automatic fee sweep disabled.");
    }
    const q = await feeQueue();
    return { enabled: false, finalized, pending: q.pending, queued: q.rows.length };
  }

  // Only sweep when the accrued backlog is worth the on-chain fees.
  const q = await feeQueue();
  if (q.pending < cfg.threshold) {
    return { enabled: true, hotWallet: cfg.hotWallet, finalized, pending: q.pending, sent: 0, skipped: "below threshold" as const };
  }

  const key = process.env.TRON_PAYOUT_PRIVATE_KEY!;
  const bal = await getBalances(cfg.hotWallet);
  const batch = q.rows.filter((r) => r.status === "accrued" || r.status === "failed").slice(0, 10);
  const total = batch.reduce((a, r) => a + Number(r.amount), 0);
  if (total <= 0) return { enabled: true, hotWallet: cfg.hotWallet, finalized, pending: q.pending, sent: 0 };
  if (total > cfg.max) {
    await alert("fee-batch", `🧾 Fee backlog $${q.pending.toFixed(2)} exceeds sweep max $${cfg.max} — paying partially.`);
  }
  if (!bal || bal.usdt < Math.min(total, cfg.max) || bal.trx < MIN_TRX_FOR_FEES) {
    await alert(
      "fee-hot-low",
      `🔋 Hot wallet ${cfg.hotWallet} needs a top-up for fee sweep: ${bal ? `${bal.usdt.toFixed(2)} USDT / ${bal.trx.toFixed(1)} TRX` : "unavailable"}. Pending fees: $${q.pending.toFixed(2)}.`,
    );
    return { enabled: true, hotWallet: cfg.hotWallet, finalized, pending: q.pending, sent: 0, skipped: "low hot balance" as const };
  }

  let sent = 0;
  let spent = 0;
  for (const f of batch) {
    const amount = Number(f.amount);
    if (spent + amount > cfg.max) break;
    const tx = await buildUsdtTransfer(cfg.hotWallet, cfg.adminWallet, amount);
    const signed = await signWithKey(tx, key);
    const claimed = await db
      .update(feeTransfers)
      .set({ status: "processing", expectedTxId: tx.txID, attempts: sql`${feeTransfers.attempts} + 1`, lastError: null })
      .where(and(eq(feeTransfers.id, f.id), inArray(feeTransfers.status, ["accrued", "failed"])))
      .returning();
    if (!claimed.length) continue;
    const r = await broadcast(signed);
    if (!r.ok) {
      await db
        .update(feeTransfers)
        .set({ status: "failed", lastError: r.error?.slice(0, 300) ?? "broadcast failed" })
        .where(eq(feeTransfers.id, f.id));
      await alert(`fee-broadcast-${f.id}`, `⚠️ Fee #${f.id} broadcast failed (${r.error}). Will retry automatically.`);
      continue;
    }
    spent += amount;
    sent++;
    if (bal) {
      bal.usdt -= amount;
      bal.trx -= 15;
    }
  }
  return { enabled: true, hotWallet: cfg.hotWallet, finalized, pending: q.pending, sent, swept: spent };
}

/** Admin records a manual on-chain fee payment (no hot wallet needed). */
export async function markFeePaid(id: number, txHash: string) {
  const clean = txHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error("bad-tx");
  return db.transaction(async (tx) => {
    const f = (await tx.select().from(feeTransfers).where(eq(feeTransfers.id, id)).for("update"))[0];
    if (!f) throw new Error("not-found");
    if (f.status === "paid") return f;
    // Verify the tx actually paid this fee before marking paid (when chain reachable).
    try {
      const lk = await lookupUsdtTransfers(clean);
      if (lk.status === "confirmed") {
        const units = lk.transfers.filter((t) => t.to === f.adminWallet).reduce((a, t) => a + t.units, BigInt(0));
        if (units < toUnits(Number(f.amount))) throw new Error("amount-mismatch");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "amount-mismatch") throw e;
      // chain unreachable → allow manual record; the tx link stays verifiable
    }
    await tx
      .update(feeTransfers)
      .set({ status: "paid", txHash: clean, paidAt: new Date(), lastError: null })
      .where(eq(feeTransfers.id, id));
    await tx.update(vault).set({ adminPaid: sql`${vault.adminPaid} + ${f.amount}`, updatedAt: new Date() });
    await tx
      .update(rounds)
      .set({ feeStatus: "paid", feeTxHash: clean, feePaidAt: new Date() })
      .where(eq(rounds.id, f.roundId));
    return { ...f, status: "paid" as const, txHash: clean };
  });
}
