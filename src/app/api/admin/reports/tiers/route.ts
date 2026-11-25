import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { getTierPerformanceReport } from "@/lib/tierReports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!requireAdminRole(req, ["ADMIN", "VIEWER"])) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ ok: true, report: await getTierPerformanceReport() });
  } catch (error) {
    return handleError(error);
  }
}
