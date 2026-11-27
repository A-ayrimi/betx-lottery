import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError, maintenanceBlocked } from "@/lib/api";
import { settleApprovedRound } from "@/lib/store";
import { assertLegacyPermission } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "rounds:settle")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const blocked = maintenanceBlocked();
  if (blocked) return blocked;
  try {
    const { id } = await params;
    const roundId = Number(id);
    if (!Number.isSafeInteger(roundId) || roundId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid round id." }, { status: 400 });
    }
    const result = await settleApprovedRound(roundId, auth.actor);
    if (!result) return NextResponse.json({ ok: false, error: "Round is not approved for settlement." }, { status: 409 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return handleError(error);
  }
}
