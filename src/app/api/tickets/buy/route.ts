import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { buyTickets, getSessionUser } from "@/lib/store";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToBuy");
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
    }
    await rateLimit("buy", me.id, 30);
    await assertRegion();
    const body = await req.json().catch(() => ({}));
    const selector = body.tierId ?? body.tierCode;
    const tierSelector =
      typeof selector === "number"
        ? selector
        : typeof selector === "string" && selector.trim()
          ? selector.trim().slice(0, 64)
          : undefined;
    const result = await buyTickets(me.id, Number(body.count) || 1, tierSelector);

    return NextResponse.json({
      ok: true,
      serials: result.serials,
      roundId: result.roundId,
      tierCode: result.tierCode,
      draw: null,
    });
  } catch (e) {
    return handleError(e);
  }
}
