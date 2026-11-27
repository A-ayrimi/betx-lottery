import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { balanceSources } from "@/lib/balanceStatus";
import { handleError } from "@/lib/api";
import { getTreasuryReconciliation } from "@/lib/treasuryAccounting";
import { assertLegacyPermission, phase2Readiness } from "@/lib/phase2Policy";
import { getPhase2ProofSummary } from "@/lib/phase2Runtime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission("ADMIN", "reconciliation:read")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const [report, proofs, phase2Gate] = await Promise.all([
      getTreasuryReconciliation(),
      getPhase2ProofSummary(),
      Promise.resolve(phase2Readiness()),
    ]);
    return NextResponse.json({ ok: true, balanceSources: balanceSources(true), report, proofs, phase2Gate });
  } catch (error) {
    return handleError(error);
  }
}
