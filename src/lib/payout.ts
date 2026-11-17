import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledger, users, withdrawals } from "@/db/schema";
import { addressFromKey } from "@/lib/tron";

/** Automatic payouts are disabled until financial reconciliation is complete. */

export function payoutConfig() {
  const key = process.env.TRON_PAYOUT_PRIVATE_KEY || "";
  const hot = key ? addressFromKey(key) : null;
  return {
    enabled: false,
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

export async function processAutoPayouts(_alert: (key: string, text: string) => Promise<void>) {
  return { enabled: false, skipped: "automatic payouts are disabled pending financial reconciliation" };
}
