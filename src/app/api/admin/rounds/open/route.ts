import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { openAdminRound } from "@/lib/store";
import { assertLegacyPermission } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "rounds:draw")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const selector = body.tierId ?? body.tierCode;
    const tierSelector =
      typeof selector === "number"
        ? selector
        : typeof selector === "string" && selector.trim()
          ? selector.trim().slice(0, 64)
          : undefined;
    const round = await openAdminRound(auth.actor, tierSelector);
    return NextResponse.json({
      ok: true,
      round: { id: round.id, status: round.status, tierId: round.tierId },
    }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
