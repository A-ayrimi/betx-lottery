import { NextResponse } from "next/server";
import { getTreasuryOnchain } from "@/lib/onchain";
import { limitByIp } from "@/lib/ratelimit";
import { handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Public: live treasury balance read directly from the TRON blockchain. */
export async function GET() {
  try {
    await limitByIp("onchain", 60);
    const data = await getTreasuryOnchain();
    return NextResponse.json(
      { ok: true, ...data },
      { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
    );
  } catch (e) {
    return handleError(e);
  }
}
