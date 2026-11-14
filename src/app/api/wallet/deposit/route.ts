import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { and, eq, lt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { config } from "@/lib/config";
import { assertCanPlay, checkDepositLimit, getSessionUser, UserError } from "@/lib/store";
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
      const amount = Math.round(Number(body.amount) * 100) / 100;
      const { minDeposit, maxDeposit } = config.limits;
      if (!Number.isFinite(amount) || amount < minDeposit || amount > maxDeposit) {
        throw new UserError("depositRange", 400, { min: `$${minDeposit}`, max: `$${maxDeposit}` });
      }
      // abandoned (never signed) requests must not eat into the daily limit
      await db
        .update(deposits)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(deposits.userId, me.id),
            eq(deposits.provider, "tron"),
            eq(deposits.status, "waiting"),
            lt(deposits.createdAt, new Date(Date.now() - 2 * 60 * 1000)),
          ),
        );
      await checkDepositLimit(me, amount);

      const transaction = await buildUsdtTransfer(me.walletAddress, tron.depositAddress, amount);
      const dep = (
        await db
          .insert(deposits)
          .values({
            userId: me.id,
            provider: "tron",
            orderId: `TRX-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`,
            amountUsd: String(amount),
            payCurrency: "usdttrc20",
            status: "waiting",
            fromAddress: me.walletAddress,
            expectedTxId: transaction.txID,
          })
          .returning()
      )[0];
      return NextResponse.json({ ok: true, depositId: dep.id, transaction });
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
