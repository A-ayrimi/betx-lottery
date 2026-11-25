import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { getTreasuryReconciliation } from "@/lib/treasuryAccounting";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const report = await getTreasuryReconciliation();
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return handleError(error);
  }
}
