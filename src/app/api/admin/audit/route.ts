import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { listAdminAuditLog } from "@/lib/adminAudit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!requireAdminRole(req, ["ADMIN", "VIEWER"])) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
    return NextResponse.json({ ok: true, entries: await listAdminAuditLog(limit) });
  } catch (error) {
    return handleError(error);
  }
}
