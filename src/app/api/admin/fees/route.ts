import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { feeTransfers } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { feeConfig, feeQueue } from "@/lib/fees";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const [q, cfg, recent] = await Promise.all([
    feeQueue(),
    Promise.resolve(feeConfig()),
    db.select().from(feeTransfers).orderBy(desc(feeTransfers.id)).limit(50),
  ]);
  return NextResponse.json({
    ok: true,
    config: {
      autoSweep: cfg.enabled,
      adminWallet: cfg.adminWallet,
      hotWallet: cfg.hotWallet,
      threshold: cfg.threshold,
      max: cfg.max,
    },
    pending: q.pending,
    paid: q.paid,
    transfers: recent.map((r) => ({
      id: r.id,
      roundId: r.roundId,
      amount: Number(r.amount),
      adminWallet: r.adminWallet,
      status: r.status,
      txHash: r.txHash,
      attempts: r.attempts,
      lastError: r.lastError,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (config.maintenanceMode) {
    return NextResponse.json({ ok: false, error: "maintenance" }, { status: 503 });
  }
  return NextResponse.json(
    { ok: false, error: "Treasury transfers are paused until historical accounting is reconciled." },
    { status: 409 },
  );
}
