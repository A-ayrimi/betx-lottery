import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { config } from "@/lib/config";
import { assertCanPlay, creditDeposit, getSessionUser, UserError } from "@/lib/store";
import { createInvoice } from "@/lib/nowpayments";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { DepositReservationError, isValidDepositIdempotencyKey, reserveDeposit } from "@/lib/depositReservations";

export const dynamic = "force-dynamic";

/**
 * Creates a USDT deposit.
 *  - live + NOWPayments configured -> hosted invoice, credited later by the IPN webhook
 *  - demo mode                     -> simulated top-up, credited instantly
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToDeposit");
    await rateLimit("deposit", me.id, 10);
    await assertRegion();
    assertCanPlay(me);
    // TRON-only mode: exchange invoices and demo top-ups are paused;
    // direct TRON wallet deposits (/api/wallet/deposit) stay enabled.
    if (config.tronOnly) throw new UserError("comingSoon", 503);

    const body = await req.json().catch(() => ({}));
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const { minDeposit, maxDeposit } = config.limits;
    if (!Number.isFinite(amount) || amount < minDeposit || amount > maxDeposit) {
      throw new UserError("depositRange", 400, { min: `$${minDeposit}`, max: `$${maxDeposit}` });
    }
    if (!isValidDepositIdempotencyKey(body.idempotencyKey)) {
      throw new UserError("depositRequestKey", 400);
    }

    const orderId = `BTX-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`;
    if (config.live && !config.nowpayments.enabled) throw new UserError("gatewayOff", 503);

    const dep = await reserveDeposit(db, {
      userId: me.id,
      provider: config.live ? "nowpayments" : "demo",
      amount,
      orderId,
      idempotencyKey: body.idempotencyKey.toLowerCase(),
      payCurrency: config.nowpayments.payCurrency,
    });

    if (!config.live) {
      await creditDeposit(dep.id, "finished");
      return NextResponse.json({ ok: true, mode: "demo", credited: amount });
    }

    try {
      const invoice = await createInvoice({
        amountUsd: amount,
        orderId,
        description: `BETX wallet top-up · ${me.username}`,
      });

      await db
        .update(deposits)
        .set({ invoiceId: String(invoice.id), invoiceUrl: invoice.invoice_url, updatedAt: new Date() })
        .where(eq(deposits.id, dep.id));

      return NextResponse.json({ ok: true, mode: "live", invoiceUrl: invoice.invoice_url });
    } catch (error) {
      try {
        await db
          .update(deposits)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(deposits.id, dep.id));
      } catch (cleanupError) {
        console.error("Could not release the failed payment deposit reservation", cleanupError);
      }
      throw error;
    }
  } catch (e) {
    if (e instanceof DepositReservationError) {
      if (e.code === "user_not_found") return handleError(new UserError("userNotFound", 404));
      if (e.code === "idempotency_conflict") return handleError(new UserError("depositRequestKey", 409));
      return handleError(new UserError("depositLimit", 403, { limit: `$${e.limit?.toFixed(2) ?? "0.00"}` }));
    }
    return handleError(e);
  }
}
