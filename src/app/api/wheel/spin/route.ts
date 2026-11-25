import { NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { getSessionUser, spinWheel } from "@/lib/store";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { WHEEL_SECTORS } from "@/lib/wheel";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToSpin");
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
    }
    await rateLimit("spin", me.id, 10);
    await assertRegion();
    const { index, prize } = await spinWheel(me.id);
    return NextResponse.json({ ok: true, index, prize, sector: WHEEL_SECTORS[index].label });
  } catch (e) {
    return handleError(e);
  }
}
