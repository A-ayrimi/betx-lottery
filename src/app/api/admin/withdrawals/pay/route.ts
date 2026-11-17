import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { withdrawals } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { processWithdrawal, UserError } from "@/lib/store";
import { broadcast, buildUsdtTransfer, isTronAddress, tron } from "@/lib/tron";
import { handleError } from "@/lib/api";
import { sendMessage } from "@/lib/telegram";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

export const dynamic = "force-dynamic";

/**
 * Pay a withdrawal from the operator's own wallet (TronLink etc.).
 * No private key ever touches the server.
 *   { step: "build",  id, from }              -> unsigned USDT transfer to the player
 *   { step: "submit", id, signedTransaction } -> broadcast + mark paid with tx hash
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const w = (await db.select().from(withdrawals).where(eq(withdrawals.id, Number(body.id))).limit(1))[0];
    if (!w) throw new UserError("wdNotFound", 404);
    if (w.status !== "pending") throw new UserError("wdProcessed");

    if (body.step === "build") {
      if (!isTronAddress(body.from) || !isTronAddress(w.address)) throw new UserError("badAddress");
      const transaction = await buildUsdtTransfer(body.from, w.address, Number(w.amount));
      await db.update(withdrawals).set({ expectedTxId: transaction.txID }).where(eq(withdrawals.id, w.id));
      return NextResponse.json({ ok: true, transaction });
    }

    if (body.step === "submit") {
      const signed = body.signedTransaction;
      if (!signed || signed.txID !== w.expectedTxId) throw new UserError("txMismatch");
      const r = await broadcast(signed);
      if (!r.ok) throw new UserError("broadcastFailed", 400, { reason: r.error ?? "" });
      const txid = r.txid ?? w.expectedTxId!;
      const { telegramId, locale } = await processWithdrawal(w.id, "paid", txid, undefined, "admin");
      if (telegramId) {
        await sendMessage(
          telegramId,
          interpolate(botStrings(locale).wdPaid, { amount: `$${Number(w.amount).toFixed(2)}` }) +
            `\n<a href="${tron.explorer}${txid}">Tronscan</a>`,
        );
      }
      return NextResponse.json({ ok: true, txid, explorer: tron.explorer + txid });
    }

    throw new UserError("txMismatch");
  } catch (e) {
    return handleError(e);
  }
}
