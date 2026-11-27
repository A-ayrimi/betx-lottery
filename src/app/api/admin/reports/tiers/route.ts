import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { assertLegacyPermission } from "@/lib/phase2Policy";
import { getTierPerformanceReport } from "@/lib/tierReports";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN", "VIEWER"]);
  if (!auth) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!assertLegacyPermission(auth.role, "reports:read")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ ok: true, report: await getTierPerformanceReport() });
  } catch (error) {
    return handleError(error);
  }
}
