import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { buyTickets, getSessionUser } from "@/lib/store";
import { assertRegion, handleError, unauthorized } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToBuy");
    await rateLimit("buy", me.id, 30);
    await assertRegion();
    const body = await req.json().catch(() => ({}));
    const result = await buyTickets(me.id, Number(body.count) || 1);

    return NextResponse.json({ ok: true, serials: result.serials, roundId: result.roundId, draw: null });
  } catch (e) {
    return handleError(e);
  }
}
