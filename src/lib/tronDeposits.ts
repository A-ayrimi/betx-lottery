import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { creditDeposit } from "@/lib/store";
import { fromUnits, lookupUsdtTransfers, sumTransfers, tron } from "@/lib/tron";
import { notifyDeposit, sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";

const EXPIRE_AFTER_MS = 10 * 60 * 1000; // TRON txs expire 60s after build; 10 min is generous

export async function afterCredit(result: Awaited<ReturnType<typeof creditDeposit>>, amount: number) {
  if (!result || result.alreadyCredited) return;
  try {
    if (result.user?.telegramId) await notifyDeposit(result.user.telegramId, amount, result.user.locale);
    if (result.inviter?.telegramId) await sendMessage(result.inviter.telegramId, botStrings(result.inviter.locale).refDeposit);
  } catch {
    /* notifications are best-effort */
  }
}

/**
 * Re-checks a broadcast wallet deposit on the solidified chain and credits it
 * exactly once. Credits the amount that actually arrived (never more).
 */
export async function settleTronDeposit(depositId: number): Promise<{ credited: boolean; status: string } | null> {
  const dep = (await db.select().from(deposits).where(eq(deposits.id, depositId)).limit(1))[0];
  if (!dep || dep.provider !== "tron") return null;
  if (dep.credited || !dep.txHash || !dep.fromAddress) return { credited: dep.credited, status: dep.status };

  const lookup = await lookupUsdtTransfers(dep.txHash);
  const mark = (status: string) =>
    db.update(deposits).set({ status, updatedAt: new Date() }).where(eq(deposits.id, dep.id));

  if (lookup.status === "pending") {
    if (Date.now() - new Date(dep.updatedAt).getTime() > EXPIRE_AFTER_MS) {
      await mark("expired");
      return { credited: false, status: "expired" };
    }
    return { credited: false, status: dep.status };
  }
  if (lookup.status === "failed") {
    await mark("failed");
    return { credited: false, status: "failed" };
  }
  const units = sumTransfers(lookup, dep.fromAddress, tron.depositAddress);
  if (units <= BigInt(0)) {
    await mark("failed");
    return { credited: false, status: "failed" };
  }
  const amount = fromUnits(units);
  await db
    .update(deposits)
    .set({ amountUsd: String(amount), status: "confirmed", updatedAt: new Date() })
    .where(eq(deposits.id, dep.id));
  const result = await creditDeposit(dep.id, "finished");
  await afterCredit(result, amount);
  return { credited: true, status: "finished" };
}

/**
 * Credits an on-chain transfer FROM a user's verified wallet that was found by
 * the scanner (no TXID needed). Re-verified on the solidified chain first.
 * Returns false if already known / not genuine.
 */
export async function creditOnchain(userId: number, txid: string, from: string) {
  const known = (await db.select({ id: deposits.id }).from(deposits).where(eq(deposits.txHash, txid)).limit(1))[0];
  if (known) return false;
  const lookup = await lookupUsdtTransfers(txid);
  if (lookup.status !== "confirmed") return false;
  const units = sumTransfers(lookup, from, tron.depositAddress);
  if (units <= BigInt(0)) return false;
  const amount = fromUnits(units);
  let depId: number;
  try {
    depId = (
      await db
        .insert(deposits)
        .values({
          userId,
          provider: "tron",
          orderId: `SCAN-${userId}-${Date.now()}-${randomBytes(3).toString("hex")}`,
          amountUsd: String(amount),
          payCurrency: "usdttrc20",
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
