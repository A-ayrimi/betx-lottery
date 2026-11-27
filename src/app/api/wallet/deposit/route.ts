import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { config, publicConfig } from "@/lib/config";
import { assertCanPlay, creditDeposit, getSessionUser, UserError } from "@/lib/store";
import {
  DepositReservationError,
  isValidDepositIdempotencyKey,
  reserveDeposit,
} from "@/lib/depositReservations";
import {
  broadcast,
  buildSolanaUsdcTransferTx,
  getSolanaConfig,
  isValidSolanaTxSignature,
  solanaExplorerTxUrl,
  verifySolanaUsdcDepositOnChain,
} from "@/lib/solana";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { assessSensitiveAction } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

async function settleSolanaDepositIfConfirmed(depositId: number): Promise<void> {
  const dep = (
    await db.select().from(deposits).where(eq(deposits.id, depositId)).limit(1)
  )[0];

  if (!dep || dep.provider !== "solana" || !dep.txHash || dep.credited) return;

  const check = await verifySolanaUsdcDepositOnChain({
    txHash: dep.txHash,
    expectedFromAddress: dep.fromAddress ?? "",
    minAmountUsd: Number(dep.amountUsd),
  });

  if (check.status === "pending") return;

  if (check.status === "failed") {
    await db
      .update(deposits)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(deposits.id, dep.id));
    return;
  }

  // Use the central transactional credit function.
  await creditDeposit(depositId, "finished");
}
/**
 * Direct USDC (SPL) deposit from the connected Solana wallet.
 *   POST { step: "build",  amount, idempotencyKey }       -> unsigned transaction
 *   POST { step: "submit", depositId, signedTransaction } -> broadcast, returns txid
 *   GET  ?id=                                             -> on-chain status (credits once confirmed)
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToDeposit");
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
    }
    if (!publicConfig().paymentsEnabled) {
      return NextResponse.json({ ok: false, error: "paymentsDisabled" }, { status: 503 });
    }
    await rateLimit("wdeposit", me.id, 20);
    const compliance = assessSensitiveAction(me, req.headers);
    if (!compliance.allowed) throw new UserError("region", 403, { country: compliance.reasons.join(",") });
    if (!me.walletAddress) throw new UserError("walletRequired");

    const solCfg = getSolanaConfig();
    if (!solCfg.treasuryAddress) throw new UserError("gatewayOff", 503);

    const body = await req.json().catch(() => ({}));

    if (body.step === "build") {
      await assertRegion();
      assertCanPlay(me);
      if (!isValidDepositIdempotencyKey(body.idempotencyKey)) {
        throw new UserError("depositRequestKey", 400);
      }

      const amount = Math.round(Number(body.amount) * 100) / 100;
      const { minDeposit, maxDeposit } = config.limits;
      const effectiveMin = Math.max(minDeposit, solCfg.minDepositUsd);
      if (
        !Number.isFinite(amount) ||
        amount < effectiveMin ||
        amount > maxDeposit
      ) {
        throw new UserError("depositRange", 400, {
          min: `$${effectiveMin}`,
          max: `$${maxDeposit}`,
        });
      }

      const dep = await reserveDeposit(db, {
        userId: me.id,
        provider: "solana",
        amount,
        orderId: `SOL-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`,
        idempotencyKey: body.idempotencyKey.toLowerCase(),
        fromAddress: me.walletAddress,
      });

      try {
        const built = await buildSolanaUsdcTransferTx({
          ownerAddress: me.walletAddress,
          amountUsd: amount,
        });
        await db
          .update(deposits)
          .set({
            expectedTxId: built.blockhash,
            updatedAt: new Date(),
          })
          .where(eq(deposits.id, dep.id));

        return NextResponse.json({
          ok: true,
          depositId: dep.id,
          treasuryAddress: solCfg.treasuryAddress,
          usdcMint: solCfg.usdcMint,
          transaction: built,
        });
      } catch (error) {
        try {
          await db
            .update(deposits)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(deposits.id, dep.id));
        } catch (cleanupError) {
          console.error(
            "Could not release the failed Solana deposit reservation",
            cleanupError
          );
        }
        throw error;
      }
    }

    if (body.step === "submit") {
      const dep = (
        await db
          .select()
          .from(deposits)
          .where(eq(deposits.id, Number(body.depositId)))
          .limit(1)
      )[0];
      if (!dep || dep.userId !== me.id || dep.provider !== "solana") {
        throw new UserError("txMismatch");
      }
      if (dep.status !== "waiting") {
        return NextResponse.json({
          ok: true,
          txid: dep.txHash,
          status: dep.status,
          explorer: dep.txHash ? solanaExplorerTxUrl(dep.txHash) : null,
        });
      }

      const r = await broadcast(body.signedTransaction);
      if (!r.ok || !r.txid || !isValidSolanaTxSignature(r.txid)) {
        await db
          .update(deposits)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(deposits.id, dep.id));
        throw new UserError("broadcastFailed", 400, { reason: r.error ?? "" });
      }

      await db
        .update(deposits)
        .set({
          txHash: r.txid,
          status: "confirming",
          updatedAt: new Date(),
        })
        .where(eq(deposits.id, dep.id));

      return NextResponse.json({
        ok: true,
        txid: r.txid,
        explorer: solanaExplorerTxUrl(r.txid),
      });
    }

    throw new UserError("txMismatch");
  } catch (e) {
    if (e instanceof DepositReservationError) {
      if (e.code === "user_not_found") {
        return handleError(new UserError("userNotFound", 404));
      }
      if (e.code === "idempotency_conflict") {
        return handleError(new UserError("depositRequestKey", 409));
      }
      return handleError(
        new UserError("depositLimit", 403, {
          limit: `$${e.limit?.toFixed(2) ?? "0.00"}`,
        })
      );
    }
    return handleError(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized();
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
    }
    if (!publicConfig().paymentsEnabled) {
      return NextResponse.json({ ok: false, error: "paymentsDisabled" }, { status: 503 });
    }
    await rateLimit("wstatus", me.id, 40);
    const compliance = assessSensitiveAction(me, req.headers);
    if (!compliance.allowed) throw new UserError("region", 403, { country: compliance.reasons.join(",") });
    const id = Number(req.nextUrl.searchParams.get("id"));
    let dep = (
      await db.select().from(deposits).where(eq(deposits.id, id)).limit(1)
    )[0];
    if (!dep || dep.userId !== me.id) throw new UserError("txMismatch", 404);

    if (dep.provider === "solana" && dep.status === "confirming") {
      await settleSolanaDepositIfConfirmed(dep.id);
      dep = (
        await db.select().from(deposits).where(eq(deposits.id, id)).limit(1)
      )[0];
    }

    return NextResponse.json({
      ok: true,
      status: dep.status,
      credited: dep.credited,
      amount: Number(dep.amountUsd),
      txid: dep.txHash,
      explorer: dep.txHash ? solanaExplorerTxUrl(dep.txHash) : null,
    });
  } catch (e) {
    return handleError(e);
  }
}