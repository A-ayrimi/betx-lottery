import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { config } from "@/lib/config";
import { assertCanPlay, getSessionUser, UserError } from "@/lib/store";
import { DepositReservationError, isValidDepositIdempotencyKey, reserveDeposit } from "@/lib/depositReservations";
import { broadcast, buildUsdtTransfer, tron } from "@/lib/tron";
import { settleTronDeposit } from "@/lib/tronDeposits";
import { assertRegion, handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Direct USDT-TRC20 deposit from the connected wallet.
 *   POST { step: "build",  amount }                       -> unsigned transaction
 *   POST { step: "submit", depositId, signedTransaction } -> broadcast, returns txid
 *   GET  ?id=                                             -> on-chain status (credits once confirmed)
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToDeposit");
    await rateLimit("wdeposit", me.id, 20);
    if (!me.walletAddress) throw new UserError("walletRequired");
    if (!tron.enabled) throw new UserError("gatewayOff", 503);
    const body = await req.json().catch(() => ({}));

    if (body.step === "build") {
      await assertRegion();
      assertCanPlay(me);
      if (!isValidDepositIdempotencyKey(body.idempotencyKey)) {
        throw new UserError("depositRequestKey", 400);
      }
      const amount = Math.round(Number(body.amount) * 100) / 100;
      const { minDeposit, maxDeposit } = config.limits;
      if (!Number.isFinite(amount) || amount < minDeposit || amount > maxDeposit) {
        throw new UserError("depositRange", 400, { min: `$${minDeposit}`, max: `$${maxDeposit}` });
      }
      const dep = await reserveDeposit(db, {
        userId: me.id,
        provider: "tron",
        amount,
        orderId: `TRX-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`,
        idempotencyKey: body.idempotencyKey.toLowerCase(),
        fromAddress: me.walletAddress,
      });
      try {
        const transaction = await buildUsdtTransfer(me.walletAddress, tron.depositAddress, amount);
        await db
          .update(deposits)
          .set({ expectedTxId: transaction.txID, updatedAt: new Date() })
          .where(eq(deposits.id, dep.id));
        return NextResponse.json({ ok: true, depositId: dep.id, transaction });
      } catch (error) {
        try {
          await db
            .update(deposits)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(deposits.id, dep.id));
        } catch (cleanupError) {
          console.error("Could not release the failed TRON deposit reservation", cleanupError);
        }
        throw error;
      }
    }

    if (body.step === "submit") {
      const dep = (await db.select().from(deposits).where(eq(deposits.id, Number(body.depositId))).limit(1))[0];
      if (!dep || dep.userId !== me.id || dep.provider !== "tron") throw new UserError("txMismatch");
      if (dep.status !== "waiting") return NextResponse.json({ ok: true, txid: dep.txHash, status: dep.status });

      const signed = body.signedTransaction;
      if (!signed || signed.txID !== dep.expectedTxId || !Array.isArray(signed.signature) || signed.signature.length === 0) {
        throw new UserError("txMismatch");
      }
      const r = await broadcast(signed);
      if (!r.ok) {
        await db.update(deposits).set({ status: "failed", updatedAt: new Date() }).where(eq(deposits.id, dep.id));
        throw new UserError("broadcastFailed", 400, { reason: r.error ?? "" });
      }
      const txid = r.txid ?? dep.expectedTxId!;
      await db
        .update(deposits)
        .set({ txHash: txid, status: "confirming", updatedAt: new Date() })
        .where(eq(deposits.id, dep.id));
      return NextResponse.json({ ok: true, txid, explorer: tron.explorer + txid });
    }

    throw new UserError("txMismatch");
  } catch (e) {
    if (e instanceof DepositReservationError) {
      if (e.code === "user_not_found") return handleError(new UserError("userNotFound", 404));
      if (e.code === "idempotency_conflict") return handleError(new UserError("depositRequestKey", 409));
      return handleError(new UserError("depositLimit", 403, { limit: `$${e.limit?.toFixed(2) ?? "0.00"}` }));
    }
    return handleError(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized();
    await rateLimit("wstatus", me.id, 40);
    const id = Number(req.nextUrl.searchParams.get("id"));
    let dep = (await db.select().from(deposits).where(eq(deposits.id, id)).limit(1))[0];
    if (!dep || dep.userId !== me.id) throw new UserError("txMismatch", 404);
    if (dep.status === "confirming") {
      await settleTronDeposit(dep.id);
      dep = (await db.select().from(deposits).where(eq(deposits.id, id)).limit(1))[0];
    }
    return NextResponse.json({
      ok: true,
      status: dep.status,
      credited: dep.credited,
      amount: Number(dep.amountUsd),
      txid: dep.txHash,
      explorer: dep.txHash ? tron.explorer + dep.txHash : null,
    });
  } catch (e) {
    return handleError(e);
  }
}
