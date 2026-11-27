import { NextRequest, NextResponse } from "next/server";
import type { VaultTf } from "@/lib/vaultCandles";
import { previewVaultPayload } from "@/lib/previewCandles";
import { isNonLivePreview, isPreviewFallbackEnabled } from "@/lib/previewFallback";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";

export const dynamic = "force-dynamic";

const VAULT_TF = ["round", "24h", "30d"] as const;

/** Public, aggregated vault candles (no player data is exposed). */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tf") ?? "24h";
  const tf: VaultTf = (VAULT_TF as readonly string[]).includes(raw) ? (raw as VaultTf) : "24h";
  if (isNonLivePreview()) {
    return NextResponse.json(previewVaultPayload(tf), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const [{ limitByIp }, { getVaultCandles }] = await Promise.all([
      import("@/lib/ratelimit"),
      import("@/lib/vaultCandles"),
    ]);
    await limitByIp("vaultchart", 120);
    const data = await getVaultCandles(tf);
    if (isPreviewFallbackEnabled() && (!data?.candles || data.candles.length === 0)) {
      return NextResponse.json(previewVaultPayload(tf), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=25" },
    });
  } catch (e) {
    if (isPreviewFallbackEnabled() || shouldUseDevPreviewFallback(e)) {
      return NextResponse.json(previewVaultPayload(tf), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const { handleError } = await import("@/lib/api");
    return handleError(e);
  }
}
