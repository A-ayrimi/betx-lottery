import { NextResponse } from "next/server";
import { isNonLivePreview, isPreviewFallbackEnabled, previewState, withPreviewFallback } from "@/lib/previewFallback";

export const dynamic = "force-dynamic";

function previewResponse() {
  return NextResponse.json(
    { ok: true, state: previewState() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  if (isNonLivePreview()) return previewResponse();
  try {
    const { getState } = await import("@/lib/store");
    const state = withPreviewFallback(await getState());
    return NextResponse.json(
      { ok: true, state },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isNonLivePreview()) return previewResponse();
    if (isPreviewFallbackEnabled()) return previewResponse();
    console.error(error);
    return NextResponse.json(
      { ok: false, error: "Application data is unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
