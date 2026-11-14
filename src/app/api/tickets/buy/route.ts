import { NextRequest, NextResponse, after } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { buyTickets, getSessionUser } from "@/lib/store";
import { assertRegion, handleError, unauthorized } from "@/lib/api";
import { notifyWinner } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized("loginToBuy");
    await rateLimit("buy", me.id, 30);
    await assertRegion();
    const body = await req.json().catch(() => ({}));
    const result = await buyTickets(me.id, Number(body.count) || 1);

    const dw = result.draw;
    if (dw?.winnerTelegramId) {
      // never make the buyer wait for Telegram
      after(() => notifyWinner(dw.winnerTelegramId!, dw.roundId, dw.prize, dw.winnerLocale).catch(() => {}));
    }

    const draw = result.draw
      ? {
          winnerName: result.draw.winnerName,
          winningSerial: result.draw.winningSerial,
          prize: result.draw.prize,
          fee: result.draw.fee,
          roundId: result.draw.roundId,
          serverSeed: result.draw.serverSeed,
          drawnAt: result.draw.drawnAt,
          adminWallet: result.draw.adminWallet,
          serials: result.draw.serials,
          youWon: result.draw.youWon,
          yourTickets: result.draw.yourTickets,
        }
      : null;

    return NextResponse.json({ ok: true, serials: result.serials, roundId: result.roundId, draw });
  } catch (e) {
    return handleError(e);
  }
}
