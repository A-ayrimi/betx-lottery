import { NextResponse } from "next/server";
import { getSessionUser, UserError } from "@/lib/store";
import { getBalances, tron } from "@/lib/tron";
import { handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Live on-chain balances of the user's connected wallet (display only). */
export async function GET() {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized();
    if (!me.walletAddress) throw new UserError("walletRequired");
    const balances = await getBalances(me.walletAddress);
    return NextResponse.json({ ok: true, address: me.walletAddress, network: tron.network, balances });
  } catch (e) {
    return handleError(e);
  }
}
