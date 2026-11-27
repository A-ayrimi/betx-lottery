import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { requireAdminRole } from "@/lib/admin";
import { balanceSources } from "@/lib/balanceStatus";
import { automationStatus, healthChecks, runAutomation } from "@/lib/automation";
import { evaluate, payoutConfig } from "@/lib/payout";
import { readinessChecks } from "@/lib/readiness";
import { getTreasuryOnchain } from "@/lib/onchain";
import { isMaintenanceMode } from "@/lib/gameConfig";
import { assertLegacyPermission, phase2Readiness } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "reports:read")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const [status, health, readiness, onchain, phase2Gate] = await Promise.all([
    automationStatus(),
    healthChecks(false).catch((e) => ({ error: String(e) })),
    readinessChecks(),
    getTreasuryOnchain(true).catch((e) => ({ error: e instanceof Error ? e.message : "on-chain balance unavailable" })),
    Promise.resolve(phase2Readiness()),
  ]);
  return NextResponse.json({ ok: true, balanceSources: balanceSources(true), status, health, readiness, phase2Gate, onchain });
}

/** { action: "run" } runs the autopilot now; { action: "evaluate" } previews payout decisions. */
export async function POST(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "maintenance:write")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: false, code: "maintenance", status: "MAINTENANCE", error: "Maintenance mode is active. Admin automation execution is disabled." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.action === "evaluate") {
    const cfg = payoutConfig();
    const pending = await db.select().from(withdrawals).where(eq(withdrawals.status, "pending")).limit(50);
    const decisions = [];
    for (const w of pending) decisions.push({ id: w.id, amount: Number(w.amount), user: w.username, ...(await evaluate(w, cfg)) });
    return NextResponse.json({ ok: true, autoPayoutEnabled: cfg.enabled, decisions });
  }
  const result = await runAutomation("admin");
  return NextResponse.json({ ok: true, ...result });
}
