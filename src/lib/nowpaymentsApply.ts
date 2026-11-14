import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { creditDeposit } from "@/lib/store";
import type { NpPayment } from "@/lib/nowpayments";
import { afterCredit } from "@/lib/tronDeposits";

type Deposit = typeof deposits.$inferSelect;

/**
 * Applies an authoritative NOWPayments payment record to our deposit.
 * Shared by the IPN webhook and the reconciliation job (missed webhooks).
 */
export async function applyNowPayment(dep: Deposit, payment: NpPayment): Promise<"credited" | "review" | "updated"> {
  await db
    .update(deposits)
    .set({ status: payment.payment_status, paymentId: String(payment.payment_id), updatedAt: new Date() })
    .where(eq(deposits.id, dep.id));

  const amountMatches =
    String(payment.price_currency).toLowerCase() === "usd" &&
    Math.abs(Number(payment.price_amount) - Number(dep.amountUsd)) < 0.01;

  if (payment.payment_status === "finished" && amountMatches) {
    const result = await creditDeposit(dep.id, "finished");
    await afterCredit(result, Number(dep.amountUsd));
    return "credited";
  }
  if (payment.payment_status === "finished" && !amountMatches) {
    console.error("NOWPayments amount/currency mismatch — manual review", dep.orderId, payment);
    await db.update(deposits).set({ status: "review", updatedAt: new Date() }).where(eq(deposits.id, dep.id));
    return "review";
  }
  return "updated";
}
