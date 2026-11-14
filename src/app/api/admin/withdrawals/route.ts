import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { deposits, withdrawals } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { processWithdrawal, getState } from "@/lib/store";
import { handleError } from "@/lib/api";
import { sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const [list, deps, state] = await Promise.all([
    db.select().from(withdrawals).orderBy(desc(withdrawals.id)).limit(100),
    db.select().from(deposits).orderBy(desc(deposits.id)).limit(50),
    getState(),
  ]);
  return NextResponse.json({ ok: true, withdrawals: list, deposits: deps, vault: state.vault });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === "paid" ? "paid" : body.action === "rejected" ? "rejected" : null;
    if (!action) return NextResponse.json({ ok: false, error: "action must be paid|rejected" }, { status: 400 });

    const { withdrawal, telegramId, locale } = await processWithdrawal(
      Number(body.id),
      action,
      body.txHash ? String(body.txHash).slice(0, 120) : undefined,
      body.note ? String(body.note).slice(0, 200) : undefined,
    );
    if (telegramId) {
      const b = botStrings(locale);
      await sendMessage(
        telegramId,
        action === "paid"
          ? interpolate(b.wdPaid, { amount: `$${Number(withdrawal.amount).toFixed(2)}` }) +
              (body.txHash ? `\nTx: <code>${String(body.txHash).slice(0, 120)}</code>` : "")
          : interpolate(b.wdRejected, { id: withdrawal.id }),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
