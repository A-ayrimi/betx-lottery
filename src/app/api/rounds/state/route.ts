import { NextRequest, NextResponse } from "next/server";
import { limitByIp } from "@/lib/ratelimit";
import { handleError } from "@/lib/api";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await limitByIp("state", 120);
    const raw = req.nextUrl.searchParams.get("tierCode");
    const tierCode = raw && /^[A-Za-z0-9_]{2,64}$/.test(raw) ? raw : undefined;
    const state = await getState(tierCode);
    return NextResponse.json(
      { ok: true, round: state.round, tiers: state.tiers },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
