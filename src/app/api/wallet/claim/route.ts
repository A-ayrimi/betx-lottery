import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { creditDeposit, getSessionUser, UserError } from "@/lib/store";
import { fromUnits, isTxId, lookupUsdtTransfers, sumTransfers, tron } from "@/lib/tron";
import { afterCredit } from "@/lib/tronDeposits";
import { handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/**
 * Manual deposit: the user sent USDT from their *connected* wallet to the
 * BETX address and pastes the TXID. Ownership is proven by the earlier wallet
 * signature, so only transfers FROM that wallet can be claimed — and each
 * TXID only once (unique index on deposits.tx_hash).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToDeposit");
    await rateLimit("claim", me.id, 10);
    if (!me.walletAddress) throw new UserError("walletRequired");
    if (!tron.enabled) throw new UserError("gatewayOff", 503);

    const { txid: raw } = await req.json().catch(() => ({ txid: "" }));
    const txid = String(raw ?? "").trim().toLowerCase();
    if (!isTxId(txid)) throw new UserError("badTxid");

    const used = (await db.select().from(deposits).where(eq(deposits.txHash, txid)).limit(1))[0];
    if (used) throw new UserError("txUsed", 409);

    const lookup = await lookupUsdtTransfers(txid);
    if (lookup.status !== "confirmed") throw new UserError("txNotFound", 409);
    const units = sumTransfers(lookup, me.walletAddress, tron.depositAddress);
    if (units <= BigInt(0) || Date.now() - lookup.blockTime > MAX_AGE_MS) throw new UserError("txNotYours");

    const amount = fromUnits(units);
    let depId: number;
    try {
      depId = (
        await db
          .insert(deposits)
          .values({
            userId: me.id,
            provider: "tron",
            orderId: `TRX-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`,
            amountUsd: String(amount),
            payCurrency: "usdttrc20",
            status: "confirmed",
            txHash: txid,
            fromAddress: me.walletAddress,
          })
          .returning()
      )[0].id;
    } catch {
      throw new UserError("txUsed", 409); // lost a race on the unique index
    }
    const result = await creditDeposit(depId, "finished");
    await afterCredit(result, amount);
    return NextResponse.json({ ok: true, amount, explorer: tron.explorer + txid });
  } catch (e) {
    return handleError(e);
  }
}
