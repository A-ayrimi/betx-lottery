import { NextRequest, NextResponse } from "next/server";
import { isNonLivePreview, isPreviewFallbackEnabled, previewRoundState } from "@/lib/previewFallback";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const previewable = isNonLivePreview();
  const raw = req.nextUrl.searchParams.get("tierCode");
  const tierCode = raw && /^[A-Za-z0-9_]{2,64}$/.test(raw) ? raw : undefined;

  if (previewable) {
    const preview = previewRoundState(tierCode);
    return NextResponse.json(
      { ok: true, round: preview.round, tiers: preview.tiers },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const [{ limitByIp }, { getState }] = await Promise.all([
      import("@/lib/ratelimit"),
      import("@/lib/store"),
    ]);
    await limitByIp("state", 120);
    const state = await getState(tierCode);
    const fallback = isPreviewFallbackEnabled() ? previewRoundState(tierCode) : null;
    return NextResponse.json(
      {
        ok: true,
        round: state.round ?? fallback?.round ?? null,
        tiers: state.tiers.length ? state.tiers : (fallback?.tiers ?? state.tiers),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isPreviewFallbackEnabled() || shouldUseDevPreviewFallback(error)) {
      const fallback = previewRoundState(tierCode);
      return NextResponse.json(
        { ok: true, round: fallback.round, tiers: fallback.tiers },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { handleError } = await import("@/lib/api");
    return handleError(error);
  }
}
