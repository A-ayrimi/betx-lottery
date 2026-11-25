import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { deposits } from "@/db/schema";
import { creditDeposit, getSessionUser, UserError } from "@/lib/store";
import { getSolanaConfig, solanaExplorerTxUrl, verifySolanaUsdcDepositOnChain } from "@/lib/solana";
import { handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Manual deposit: the user sent USDC from their *connected* wallet to the
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
    const solana = getSolanaConfig();
    if (!solana.treasuryAddress) throw new UserError("gatewayOff", 503);

    const { txid: raw } = await req.json().catch(() => ({ txid: "" }));
    const txid = String(raw ?? "").trim();
    if (!txid) throw new UserError("badTxid");

    const used = (await db.select().from(deposits).where(eq(deposits.txHash, txid)).limit(1))[0];
    if (used) throw new UserError("txUsed", 409);

    const check = await verifySolanaUsdcDepositOnChain({
      txHash: txid,
      expectedFromAddress: me.walletAddress,
      minAmountUsd: 1,
    });
    if (check.status === "pending") throw new UserError("txNotFound", 409);
    if (check.status === "failed") throw new UserError("txNotYours");
    const amount = check.amountUsd ?? 0;
    if (amount <= 0) throw new UserError("txNotYours");
    let depId: number;
    try {
      depId = (
        await db
          .insert(deposits)
          .values({
            userId: me.id,
            provider: "solana",
            orderId: `SOL-${me.id}-${Date.now()}-${randomBytes(3).toString("hex")}`,
            amountUsd: String(amount),
            payCurrency: "usdc",
            status: "confirmed",
            txHash: txid,
            fromAddress: me.walletAddress,
          })
          .returning()
      )[0].id;
    } catch {
      throw new UserError("txUsed", 409); // lost a race on the unique index
    }
    await creditDeposit(depId, "finished");
    return NextResponse.json({ ok: true, amount, explorer: solanaExplorerTxUrl(txid) });
  } catch (e) {
    return handleError(e);
  }
}
