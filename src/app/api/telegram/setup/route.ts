import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { tg } from "@/lib/telegram";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * Run once after deploying:  GET /api/telegram/setup?key=ADMIN_TOKEN
 * Registers the webhook, the command list and the Mini App menu button.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!config.telegram.enabled || !config.telegram.webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required" },
      { status: 400 },
    );
  }

  const webhook = await tg("setWebhook", {
    url: `${config.appUrl}/api/telegram/webhook`,
    secret_token: config.telegram.webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  const COMMANDS: Record<string, [string, string, string, string]> = {
    en: ["Start & claim a free spin", "My personal invite link", "Balance & bonus spins", "One-time web login link"],
    es: ["Empezar y ganar un giro gratis", "Mi enlace de invitación", "Saldo y giros extra", "Enlace de acceso web"],
    fa: ["شروع و دریافت شانس رایگان", "لینک دعوت اختصاصی من", "موجودی و چرخاندن‌های جایزه", "لینک ورود یک‌بار مصرف"],
    ar: ["ابدأ واحصل على دورة مجانية", "رابط دعوتي الشخصي", "الرصيد والدورات الإضافية", "رابط دخول لمرة واحدة"],
    tr: ["Başla ve ücretsiz çevirme al", "Kişisel davet bağlantım", "Bakiye ve bonus çevirmeler", "Tek kullanımlık giriş bağlantısı"],
    ru: ["Старт и бесплатное вращение", "Моя пригласительная ссылка", "Баланс и бонусные вращения", "Одноразовая ссылка для входа"],
  };
  const commands: Record<string, unknown> = {};
  for (const [lang, [s1, s2, s3, s4]] of Object.entries(COMMANDS)) {
    commands[lang] = await tg("setMyCommands", {
      commands: [
        { command: "start", description: s1 },
        { command: "invite", description: s2 },
        { command: "balance", description: s3 },
        { command: "login", description: s4 },
      ],
      ...(lang === "en" ? {} : { language_code: lang }),
    });
  }
  const menu = await tg("setChatMenuButton", {
    menu_button: { type: "web_app", text: "BETX 🎰", web_app: { url: config.appUrl } },
  });
  const info = await tg("getWebhookInfo", {});

  return NextResponse.json({ ok: true, webhook, commands, menu, info });
}
