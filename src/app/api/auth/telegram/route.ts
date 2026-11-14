import { NextRequest, NextResponse } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { config } from "@/lib/config";
import { verifyInitData, sendMessage } from "@/lib/telegram";
import { upsertTelegramUser } from "@/lib/tgUser";
import { setSession, UserError } from "@/lib/store";
import { assertRegion, handleError } from "@/lib/api";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

export const dynamic = "force-dynamic";

/** Telegram Mini App sign-in: the client posts window.Telegram.WebApp.initData */
export async function POST(req: NextRequest) {
  try {
    if (config.tronOnly) throw new UserError("comingSoon", 503);
    const country = await assertRegion();
    await limitByIp("tgauth", 20);
    const { initData } = await req.json().catch(() => ({ initData: "" }));
    const verified = verifyInitData(String(initData || ""));
    if (!verified) throw new UserError("badSignature", 401);
    const ref = verified.startParam?.startsWith("ref_") ? verified.startParam.slice(4) : null;
    const { user, created, inviter } = await upsertTelegramUser(verified.user, ref, country);
    if (inviter?.telegramId) {
      await sendMessage(
        inviter.telegramId,
        interpolate(botStrings(inviter.locale).inviteJoined, { name: user.displayName, count: "+1" }),
      );
    }
    await setSession(user.id);
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return handleError(e);
  }
}
