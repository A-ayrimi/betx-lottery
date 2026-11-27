import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { approveRoundResult } from "@/lib/store";
import { assertLegacyPermission } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "rounds:settle")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const roundId = Number(id);
    if (!Number.isSafeInteger(roundId) || roundId <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid round id." }, { status: 400 });
    }
    const body = await req.json();
    if (typeof body.approved !== "boolean") {
      return NextResponse.json({ ok: false, error: "approved must be a boolean." }, { status: 400 });
    }
    const result = await approveRoundResult(roundId, body.approved, auth.actor);
    if (!result) return NextResponse.json({ ok: false, error: "Round is not awaiting review." }, { status: 409 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return handleError(error);
  }
}
