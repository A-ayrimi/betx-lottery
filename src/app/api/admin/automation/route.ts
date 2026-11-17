import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { automationStatus, healthChecks, runAutomation } from "@/lib/automation";
import { evaluate, payoutConfig } from "@/lib/payout";
import { readinessChecks } from "@/lib/readiness";
import { getTreasuryOnchain } from "@/lib/onchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const [status, health, readiness, onchain] = await Promise.all([
    automationStatus(),
    healthChecks(false).catch((e) => ({ error: String(e) })),
    readinessChecks(),
    getTreasuryOnchain(true).catch((e) => ({ error: e instanceof Error ? e.message : "on-chain balance unavailable" })),
  ]);
  return NextResponse.json({ ok: true, status, health, readiness, onchain });
}

/** { action: "run" } runs the autopilot now; { action: "evaluate" } previews payout decisions. */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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
