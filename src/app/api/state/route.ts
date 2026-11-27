import { NextResponse } from "next/server";
import { isNonLivePreview, isPreviewFallbackEnabled, previewState, withPreviewFallback } from "@/lib/previewFallback";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";
import { balanceSources } from "@/lib/balanceStatus";

export const dynamic = "force-dynamic";

function balanceBlock(state: unknown, live: boolean) {
  const snapshot = state as { vault?: { balance?: number | string; initialCapital?: number | string } };
  const sources = balanceSources(live);
  return {
    sources,
    internalLedger: {
      status: sources.internalLedger,
      balanceUsd: Number(snapshot.vault?.balance ?? 0),
      protectedInitialCapitalUsd: Number(snapshot.vault?.initialCapital ?? 0),
    },
    onchainTreasury: {
      status: sources.onchainTreasury,
      usdc: null,
      sol: null,
      sourceEndpoint: "/api/vault/onchain",
    },
  };
}

function response(state: unknown, live: boolean) {
  return NextResponse.json(
    { ok: true, balances: balanceBlock(state, live), state },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function previewResponse() {
  return response(previewState(), false);
}

export async function GET() {
  if (isNonLivePreview()) return previewResponse();
  try {
    const { getState } = await import("@/lib/store");
    const state = withPreviewFallback(await getState());
    return response(state, Boolean((state as { config?: { live?: boolean } }).config?.live));
  } catch (error) {
    if (shouldUseDevPreviewFallback(error)) return previewResponse();
    if (isNonLivePreview()) return previewResponse();
    if (isPreviewFallbackEnabled()) return previewResponse();
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "Application data is unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
