import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { listAdminAuditLog } from "@/lib/adminAudit";
import { listAdminAuditChain } from "@/lib/phase2Runtime";
import { assertLegacyPermission } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN", "VIEWER"]);
  if (!auth) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!assertLegacyPermission(auth.role, "audit:read")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 100);
    const [entries, chain] = await Promise.all([listAdminAuditLog(limit), listAdminAuditChain(limit)]);
    return NextResponse.json({ ok: true, entries, chain });
  } catch (error) {
    return handleError(error);
  }
}
