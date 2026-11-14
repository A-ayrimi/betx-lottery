import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledger, users, withdrawals } from "@/db/schema";
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
import { sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

/**
 * Automatic withdrawals from a HOT wallet with a rules-based risk policy.
 *
 * Exactly-once design: a withdrawal is moved to `processing` (with the tx id)
 * BEFORE broadcasting. It only becomes `paid` once the transfer is seen on the
 * solidified chain, and only returns to `pending` once the signed tx has
 * provably expired. A crash at any point can therefore never pay twice.
 */

const EXPIRE_MS = 10 * 60 * 1000;
const MIN_TRX_FOR_FEES = 30;

export function payoutConfig() {
  const key = process.env.TRON_PAYOUT_PRIVATE_KEY || "";
  const hot = key ? addressFromKey(key) : null;
  return {
    enabled: process.env.AUTO_PAYOUT === "on" && Boolean(hot),
    keyConfigured: Boolean(key),
    keyValid: Boolean(hot),
    hotWallet: hot,
    maxPerTx: Number(process.env.AUTO_PAYOUT_MAX || 50),
    dailyMax: Number(process.env.AUTO_PAYOUT_DAILY_MAX || 300),
    maxPerUserDay: Number(process.env.AUTO_PAYOUT_MAX_PER_USER_DAY || 3),
    minAccountAgeHours: Number(process.env.AUTO_PAYOUT_MIN_ACCOUNT_AGE_HOURS || 1),
    minPlayRatio: Number(process.env.AUTO_PAYOUT_MIN_PLAY_RATIO || 0.3),
  };
}

type W = typeof withdrawals.$inferSelect;
export type Verdict = { ok: true } | { ok: false; reason: string };

/** Rules engine. Anything not clearly safe goes to the manual review queue. */
export async function evaluate(w: W, cfg = payoutConfig()): Promise<Verdict> {
  const amount = Number(w.amount);
  const u = (await db.select().from(users).where(eq(users.id, w.userId)).limit(1))[0];
  if (!u) return { ok: false, reason: "user not found" };
  if (amount > cfg.maxPerTx) return { ok: false, reason: `amount above auto limit ($${cfg.maxPerTx})` };
  if (!u.walletAddress || u.walletAddress !== w.address) {
    return { ok: false, reason: "destination is not the user's verified (signed-in) wallet" };
  }
  if (Date.now() - new Date(u.createdAt).getTime() < cfg.minAccountAgeHours * 3600_000) {
    return { ok: false, reason: `account younger than ${cfg.minAccountAgeHours}h` };
  }
  const deposited = Number(u.totalDeposited);
  if (deposited <= 0) return { ok: false, reason: "no confirmed deposit yet" };

  const [agg] = await db
    .select({
      // net play: refunded tickets don't count as played
      spent: sql<string>`coalesce(-sum(case when ${ledger.type} in ('ticket_buy', 'ticket_refund') then ${ledger.amount} else 0 end), 0)`,
      total: sql<string>`coalesce(sum(${ledger.amount}), 0)`,
    })
    .from(ledger)
    .where(eq(ledger.userId, u.id));
  if (Number(agg.spent) < deposited * cfg.minPlayRatio) {
    return { ok: false, reason: `low play-through (${Number(agg.spent).toFixed(2)} of ${deposited.toFixed(2)} deposited) — AML check` };
  }
  if (Math.abs(Number(u.balance) - Number(agg.total)) > 0.009) {
    return { ok: false, reason: "balance does not match ledger" };
  }

  const since = new Date(Date.now() - 24 * 3600_000);
  const [day] = await db
    .select({ sum: sql<string>`coalesce(sum(${withdrawals.amount}), 0)` })
    .from(withdrawals)
    .where(and(eq(withdrawals.auto, true), gte(withdrawals.processedAt, since), sql`${withdrawals.status} in ('processing','paid')`));
  if (Number(day.sum) + amount > cfg.dailyMax) return { ok: false, reason: `daily auto-payout cap reached ($${cfg.dailyMax})` };

  const [mine] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(withdrawals)
    .where(and(eq(withdrawals.userId, u.id), eq(withdrawals.auto, true), gte(withdrawals.processedAt, since)));
  if ((mine?.c ?? 0) >= cfg.maxPerUserDay) return { ok: false, reason: "too many withdrawals for this user today" };

  return { ok: true };
}

async function notifyPaid(w: W, txid: string) {
  const u = (await db.select().from(users).where(eq(users.id, w.userId)).limit(1))[0];
  if (!u?.telegramId) return;
  try {
    await sendMessage(
      u.telegramId,
      interpolate(botStrings(u.locale).wdPaid, { amount: `$${Number(w.amount).toFixed(2)}` }) +
        `\n<a href="${tron.explorer}${txid}">Tronscan</a>`,
    );
  } catch {
    /* best effort */
  }
}

/** Moves `processing` payouts forward based on the chain — never pays twice. */
export async function finalizeProcessing(alert: (key: string, text: string) => Promise<void>) {
  const list = await db.select().from(withdrawals).where(eq(withdrawals.status, "processing"));
  let paid = 0, reverted = 0;
  for (const w of list) {
    if (!w.expectedTxId) continue;
    const lk = await lookupUsdtTransfers(w.expectedTxId);
    if (lk.status === "confirmed") {
      const units = lk.transfers.filter((t) => t.to === w.address).reduce((a, t) => a + t.units, BigInt(0));
      if (units >= toUnits(Number(w.amount))) {
        await db
          .update(withdrawals)
          .set({ status: "paid", txHash: w.expectedTxId, processedAt: new Date(), reviewReason: null })
          .where(and(eq(withdrawals.id, w.id), eq(withdrawals.status, "processing")));
        await notifyPaid(w, w.expectedTxId);
        paid++;
      } else {
        await alert(`payout-mismatch-${w.id}`, `🚨 Payout #${w.id}: tx confirmed but amount mismatch. Manual check needed: ${tron.explorer}${w.expectedTxId}`);
      }
    } else if (lk.status === "failed" || Date.now() - new Date(w.processedAt ?? w.createdAt).getTime() > EXPIRE_MS) {
      // failed execution or expired tx => no funds moved => safe to retry
      await db
        .update(withdrawals)
        .set({
          status: "pending",
          expectedTxId: null,
          reviewReason: lk.status === "failed" ? `payout tx failed on-chain (${lk.reason}); will retry` : "payout tx expired; will retry",
        })
        .where(and(eq(withdrawals.id, w.id), eq(withdrawals.status, "processing")));
      reverted++;
    }
  }
  return { paid, reverted };
}

export async function processAutoPayouts(alert: (key: string, text: string) => Promise<void>) {
  const finalized = await finalizeProcessing(alert);
  const cfg = payoutConfig();
  if (!cfg.enabled || !cfg.hotWallet) {
    if (cfg.keyConfigured && !cfg.keyValid) await alert("payout-key", "🚨 TRON_PAYOUT_PRIVATE_KEY is malformed — auto payouts disabled.");
    return { enabled: false, finalized };
  }
  const key = process.env.TRON_PAYOUT_PRIVATE_KEY!;
  const bal = await getBalances(cfg.hotWallet);
  const pending = await db.select().from(withdrawals).where(eq(withdrawals.status, "pending")).orderBy(withdrawals.id).limit(10);
  let sent = 0, review = 0;

  for (const w of pending) {
    const amount = Number(w.amount);
    const verdict = await evaluate(w, cfg);
    if (!verdict.ok) {
      if (w.reviewReason !== verdict.reason) {
        await db.update(withdrawals).set({ reviewReason: verdict.reason }).where(eq(withdrawals.id, w.id));
        await alert(`review-${w.id}`, `🧾 Withdrawal #${w.id} ($${amount.toFixed(2)}, ${w.username}) needs manual review: ${verdict.reason}`);
      }
      review++;
      continue;
    }
    if (!bal || bal.usdt < amount || bal.trx < MIN_TRX_FOR_FEES) {
      await alert(
        "hot-wallet-low",
        `🔋 Hot wallet ${cfg.hotWallet} needs a top-up: ${bal ? `${bal.usdt.toFixed(2)} USDT / ${bal.trx.toFixed(1)} TRX` : "balance unavailable"}. Pending payout #${w.id} = $${amount.toFixed(2)}.`,
      );
      break;
    }

    const tx = await buildUsdtTransfer(cfg.hotWallet, w.address, amount);
    const signed = await signWithKey(tx, key);
    const claimed = await db
      .update(withdrawals)
      .set({ status: "processing", expectedTxId: tx.txID, auto: true, reviewReason: null, processedAt: new Date() })
      .where(and(eq(withdrawals.id, w.id), eq(withdrawals.status, "pending")))
      .returning();
    if (!claimed.length) continue; // an admin acted on it meanwhile

    const r = await broadcast(signed);
    if (!r.ok) {
      // stays `processing`; finalizeProcessing reverts it once the tx has provably expired
      await alert(`payout-broadcast-${w.id}`, `⚠️ Payout #${w.id} broadcast failed (${r.error}). Will retry automatically after expiry.`);
      continue;
    }
    bal.usdt -= amount;
    bal.trx -= 15;
    sent++;
  }
  return { enabled: true, hotWallet: cfg.hotWallet, sent, review, finalized };
}
