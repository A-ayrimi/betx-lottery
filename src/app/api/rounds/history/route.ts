import { NextRequest, NextResponse } from "next/server";
import { getDrawHistory } from "@/lib/store";
import { limitByIp } from "@/lib/ratelimit";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";

export const dynamic = "force-dynamic";

/** Public, transparent draw history: winner, serial, prize, exact time. */
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || 20);
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);
  try {
    await limitByIp("history", 60);
    const history = await getDrawHistory(limit, offset);
    return NextResponse.json(
      { ok: true, ...history },
      { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=20" } },
    );
  } catch (e) {
    if (shouldUseDevPreviewFallback(e)) {
      return NextResponse.json(
        { ok: true, total: 0, limit, offset, draws: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "history_failed" }, { status: 500 });
  }
}
