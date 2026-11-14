import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { feeTransfers } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { feeConfig, feeQueue, markFeePaid } from "@/lib/fees";

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

/** Record a manual on-chain fee payment: { id, txHash } */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const done = await markFeePaid(Number(body.id), String(body.txHash ?? ""));
    return NextResponse.json({ ok: true, transfer: { id: done.id, status: done.status, txHash: done.txHash } });
  } catch (e) {
    const code = e instanceof Error ? e.message : "failed";
    if (code === "bad-tx") return NextResponse.json({ ok: false, error: "Invalid transaction hash." }, { status: 400 });
    if (code === "not-found") return NextResponse.json({ ok: false, error: "Fee transfer not found." }, { status: 404 });
    if (code === "amount-mismatch") {
      return NextResponse.json({ ok: false, error: "On-chain amount does not cover this fee." }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
