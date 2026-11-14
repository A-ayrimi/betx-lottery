import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { getPayment, verifyIpnSignature } from "@/lib/nowpayments";
import { applyNowPayment } from "@/lib/nowpaymentsApply";

export const dynamic = "force-dynamic";

/**
 * NOWPayments IPN webhook.
 * 1. verify x-nowpayments-sig (HMAC-SHA512 over key-sorted JSON)
 * 2. re-fetch the payment from the API (authoritative)
 * 3. match order_id + currency + amount against our own deposit row
 * 4. credit exactly once, only on "finished"
 * Missed webhooks are recovered by the automation job (reconcileDeposits).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!verifyIpnSignature(body, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  try {
    const paymentId = body.payment_id as string | number | undefined;
    if (!paymentId) return NextResponse.json({ ok: true, ignored: "no payment_id" });

    const payment = await getPayment(paymentId);
    if (!payment.order_id) return NextResponse.json({ ok: true, ignored: "no order_id" });

    const dep = (await db.select().from(deposits).where(eq(deposits.orderId, payment.order_id)).limit(1))[0];
    if (!dep) return NextResponse.json({ ok: true, ignored: "unknown order" });

    const result = await applyNowPayment(dep, payment);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("IPN processing failed", e);
    // non-2xx makes NOWPayments retry later
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
