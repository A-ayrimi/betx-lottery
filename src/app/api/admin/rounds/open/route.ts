import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { openAdminRound } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const round = await openAdminRound("admin");
    return NextResponse.json({ ok: true, round: { id: round.id, status: round.status } }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
