import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { loginTokens } from "@/db/schema";
import { config } from "@/lib/config";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

type InlineButton =
  | { text: string; url: string }
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string };

export async function tg(method: string, payload: Record<string, unknown>) {
  if (!config.telegram.enabled) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const json = await res.json();
    if (!json.ok) console.error("telegram", method, json.description);
    return json;
  } catch (e) {
    console.error("telegram request failed", method, e);
    return null;
  }
}

export function sendMessage(chatId: string | number, text: string, buttons?: InlineButton[][]) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

export function referralLink(code: string) {
  const bot = config.telegram.username;
  return bot ? `https://t.me/${bot}?start=ref_${code}` : `${config.appUrl}/?ref=${code}`;
}

/** One-time, 10-minute login link the bot hands to a user. */
export async function createLoginLink(userId: number) {
  const token = randomBytes(24).toString("base64url");
  await db.insert(loginTokens).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  return `${config.appUrl}/api/auth/telegram-link?token=${token}`;
}

/**
 * Validates Telegram Mini App initData.
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * hash   = hex(HMAC_SHA256(key=secret, msg=data_check_string))
 */
export function verifyInitData(initData: string, maxAgeSec = 24 * 3600) {
  if (!config.telegram.token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(config.telegram.token).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get("user") || "null") as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    } | null;
    if (!user?.id) return null;
    return { user, startParam: params.get("start_param") };
  } catch {
    return null;
  }
}

export async function notifyWinner(telegramId: string, roundId: number, prize: number, locale?: string) {
  const b = botStrings(locale);
  await sendMessage(telegramId, interpolate(b.winner, { round: roundId, prize: `$${prize.toFixed(2)}` }), [
    [{ text: b.open, web_app: { url: config.appUrl } }],
  ]);
}

export async function notifyDeposit(telegramId: string, amount: number, locale?: string) {
  const b = botStrings(locale);
  await sendMessage(telegramId, interpolate(b.deposit, { amount: `$${amount.toFixed(2)}` }), [
    [{ text: b.buyTicket, web_app: { url: `${config.appUrl}/#pool` } }],
  ]);
}
