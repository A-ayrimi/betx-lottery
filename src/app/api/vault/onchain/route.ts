import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { addressExplorerUrl, getTreasuryOnchain } from "@/lib/onchain";
import { limitByIp } from "@/lib/ratelimit";
import { handleError } from "@/lib/api";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";

export const dynamic = "force-dynamic";

/** Public: live treasury balance read directly from the Solana blockchain. */
export async function GET() {
  try {
    await limitByIp("onchain", 60);
    const data = await getTreasuryOnchain();
    return NextResponse.json(
      { ok: true, ...data },
      { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
    );
  } catch (e) {
    if (shouldUseDevPreviewFallback(e)) {
      return NextResponse.json(
        {
          ok: true,
          address: config.adminWallet,
          network: "solana",
          status: "unavailable",
          usdc: null,
          sol: null,
          fetchedAt: new Date().toISOString(),
          explorerUrl: addressExplorerUrl(config.adminWallet),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return handleError(e);
  }
}
