import { NextRequest, NextResponse, after } from "next/server";
import { limitByIp, rateLimit } from "@/lib/ratelimit";
import { getSessionUser, requestWithdrawal, UserError } from "@/lib/store";
import { handleError, unauthorized } from "@/lib/api";
import { config, publicConfig } from "@/lib/config";
import { sendMessage } from "@/lib/telegram";
import { assessSensitiveAction } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser();
    if (!me) return unauthorized();
    if (config.maintenanceMode) {
      return NextResponse.json({ ok: false, code: "maintenance", status: "MAINTENANCE", error: "maintenance" }, { status: 503 });
    }
    if (!publicConfig().paymentsEnabled) {
      return NextResponse.json({ ok: false, error: "paymentsDisabled" }, { status: 503 });
    }
    await rateLimit("withdraw", me.id, 5);
    const compliance = assessSensitiveAction(me, req.headers);
    if (!compliance.allowed) throw new UserError("region", 403, { country: compliance.reasons.join(",") });
    const body = await req.json().catch(() => ({}));
    const w = await requestWithdrawal(me.id, Number(body.amount), String(body.address ?? "").trim());

    // optional: ping the operator's Telegram chat
    const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminChat) {
      after(() =>
        sendMessage(
        adminChat,
        `💸 Withdrawal request #${w.id}\nUser: ${me.username}\nAmount: $${Number(w.amount).toFixed(2)}\nAddress: <code>${w.address}</code>\n\n${config.appUrl}/admin`,
        ).then(() => undefined, () => undefined),
      );
    }
    return NextResponse.json({ ok: true, id: w.id });
  } catch (e) {
    return handleError(e);
  }
}
