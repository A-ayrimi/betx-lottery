import { NextRequest, NextResponse } from "next/server";
import { getVaultCandles, VAULT_TF, type VaultTf } from "@/lib/vaultCandles";
import { limitByIp } from "@/lib/ratelimit";
import { handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public, aggregated vault candles (no player data is exposed). */
export async function GET(req: NextRequest) {
  try {
    await limitByIp("vaultchart", 120);
    const raw = req.nextUrl.searchParams.get("tf") ?? "24h";
    const tf: VaultTf = (VAULT_TF as readonly string[]).includes(raw) ? (raw as VaultTf) : "24h";
    const data = await getVaultCandles(tf);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=25" },
    });
  } catch (e) {
    return handleError(e);
  }
}
