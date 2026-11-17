import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { approveRoundResult } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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
    const result = await approveRoundResult(roundId, body.approved, "admin");
    if (!result) return NextResponse.json({ ok: false, error: "Round is not awaiting review." }, { status: 409 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return handleError(error);
  }
}
