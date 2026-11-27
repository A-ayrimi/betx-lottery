import { NextResponse } from "next/server";
import { balanceSources } from "@/lib/balanceStatus";
import { getSessionUser, UserError } from "@/lib/store";
import { getSolanaUsdcBalance, getSolanaConfig, getSolanaConnection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";
import { handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Live on-chain balances of the user's connected wallet (display only). */
export async function GET() {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized();
    if (!me.walletAddress) throw new UserError("walletRequired");
    const [usdc, lamports] = await Promise.all([
      getSolanaUsdcBalance(me.walletAddress),
      getSolanaConnection().getBalance(new PublicKey(me.walletAddress), "confirmed"),
    ]);
    const balances = { usdc, sol: lamports / 1e9 };
    return NextResponse.json({
      ok: true,
      address: me.walletAddress,
      network: getSolanaConfig().cluster,
      source: balanceSources(true).onchainTreasury,
      balances,
    });
  } catch (e) {
    return handleError(e);
  }
}