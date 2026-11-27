import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { getSessionUser, spinWheel, UserError } from "@/lib/store";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { WHEEL_SECTORS } from "@/lib/wheel";
import { config } from "@/lib/config";
import { assessSensitiveAction } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToSpin");
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
    }
    await rateLimit("spin", me.id, 10);
    await assertRegion();
    const compliance = assessSensitiveAction(me, req.headers);
    if (!compliance.allowed) throw new UserError("region", 403, { country: compliance.reasons.join(",") });
    const { index, prize } = await spinWheel(me.id);
    return NextResponse.json({ ok: true, index, prize, sector: WHEEL_SECTORS[index].label });
  } catch (e) {
    return handleError(e);
  }
}
