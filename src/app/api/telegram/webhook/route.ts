import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { config } from "@/lib/config";
import { createLoginLink, referralLink, sendMessage, tg } from "@/lib/telegram";
import { upsertTelegramUser, type TgProfile } from "@/lib/tgUser";
import { botStrings } from "@/i18n/bot";
import { interpolate } from "@/i18n/config";

export const dynamic = "force-dynamic";

interface TgUpdate {
  message?: { chat: { id: number; type: string }; from?: TgProfile; text?: string };
  callback_query?: { id: string; from: TgProfile; message?: { chat: { id: number } }; data?: string };
}

function secretOk(req: NextRequest) {
  const expected = config.telegram.webhookSecret;
  if (!expected) return false;
  const got = req.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

const keyboard = (b: ReturnType<typeof botStrings>, locale: string) => [
  [{ text: b.open, web_app: { url: `${config.appUrl}/${locale}` } }],
  [
    { text: b.myLink, callback_data: "invite" },
    { text: b.balance, callback_data: "balance" },
  ],
  [{ text: b.webLogin, callback_data: "login" }],
];

async function invitedCount(code: string) {
  const r = await db.select({ c: sql<number>`count(*)::int` }).from(users).where(eq(users.referredBy, code));
  return r[0]?.c ?? 0;
}

async function handleCommand(chatId: number, from: TgProfile, command: string, arg: string | null) {
  if (command === "start") {
    const ref = arg?.startsWith("ref_") ? arg.slice(4) : null;
    const { user, created, inviter } = await upsertTelegramUser(from, ref);
    const b = botStrings(user.locale);

    if (inviter?.telegramId) {
      const n = await invitedCount(inviter.referralCode);
      await sendMessage(
        inviter.telegramId,
        interpolate(botStrings(inviter.locale).inviteJoined, { name: user.displayName, count: n }),
      );
    }

    const text = created
      ? interpolate(b.welcomeNew, { name: user.displayName }) +
        (inviter ? b.viaInvite : "") +
        interpolate(b.terms, { url: `${config.appUrl}/${user.locale}/terms` })
      : interpolate(b.welcomeBack, { name: user.displayName });
    await sendMessage(chatId, text, keyboard(b, user.locale));
    return;
  }

  const { user } = await upsertTelegramUser(from, null);
  const b = botStrings(user.locale);

  if (command === "invite") {
    const link = referralLink(user.referralCode);
    const n = await invitedCount(user.referralCode);
    await sendMessage(
      chatId,
      interpolate(b.inviteText, { link, bonus: `$${config.limits.referralDepositBonus.toFixed(2)}`, count: n }),
      [[{ text: b.share, url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(b.shareText)}` }]],
    );
    return;
  }

  if (command === "balance") {
    await sendMessage(
      chatId,
      interpolate(b.balanceText, { balance: `$${Number(user.balance).toFixed(2)}`, spins: user.bonusSpins }),
      [[{ text: b.open, web_app: { url: `${config.appUrl}/${user.locale}` } }]],
    );
    return;
  }

  if (command === "login") {
    const link = await createLoginLink(user.id);
    await sendMessage(chatId, b.loginText, [[{ text: b.loginButton, url: link }]]);
    return;
  }

  await sendMessage(chatId, b.help, keyboard(b, user.locale));
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) return NextResponse.json({ ok: false }, { status: 401 });

  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.message?.text && update.message.from && update.message.chat.type === "private") {
      const m = update.message.text.trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(\S+))?/i);
      const from = update.message.from;
      if (m) await handleCommand(update.message.chat.id, from, m[1].toLowerCase(), m[2] ?? null);
      else await handleCommand(update.message.chat.id, from, "help", null);
    } else if (update.callback_query) {
      const cq = update.callback_query;
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      const chatId = cq.message?.chat.id ?? cq.from.id;
      if (cq.data) await handleCommand(chatId, cq.from, cq.data, null);
    }
  } catch (e) {
    console.error("telegram webhook error", e);
  }
  return NextResponse.json({ ok: true });
}
