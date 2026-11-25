import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { openAdminRound } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const selector = body.tierId ?? body.tierCode;
    const tierSelector =
      typeof selector === "number"
        ? selector
        : typeof selector === "string" && selector.trim()
          ? selector.trim().slice(0, 64)
          : undefined;
    const round = await openAdminRound("admin", tierSelector);
    return NextResponse.json({
      ok: true,
      round: { id: round.id, status: round.status, tierId: round.tierId },
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
