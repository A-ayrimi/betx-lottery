import { config } from "@/lib/config";
import { isTronAddress, tron } from "@/lib/tron";
import { getTreasuryOnchain } from "@/lib/onchain";

export interface ReadinessCheck {
  key: string;
  ok: boolean;
  level: "critical" | "warning";
  detail: string;
}

/** Everything that must be true before taking real money online. */
export async function readinessChecks(): Promise<{ ready: boolean; checks: ReadinessCheck[] }> {
  const env = process.env;
  const url = config.appUrl;
  const checks: ReadinessCheck[] = [
    { key: "SESSION_SECRET", ok: (env.SESSION_SECRET ?? "").length >= 32, level: "critical", detail: "≥32 random characters; signs login sessions" },
    { key: "APP_URL", ok: url.startsWith("https://") && !/localhost|127\.0\.0\.1/.test(url), level: "critical", detail: `public https domain (now: ${url})` },
    { key: "ADMIN_TOKEN", ok: (env.ADMIN_TOKEN ?? "").length >= 16, level: "critical", detail: "≥16 chars; protects /admin" },
    { key: "CRON_SECRET", ok: (env.CRON_SECRET ?? "").length >= 16, level: "critical", detail: "≥16 chars; protects /api/cron" },
    { key: "BETX_MODE", ok: config.live, level: "warning", detail: "set to live for real money (demo credits free balance)" },
    { key: "ADMIN_WALLET", ok: isTronAddress(config.adminWallet), level: "critical", detail: config.adminWallet },
    { key: "TRON_DEPOSIT_ADDRESS", ok: tron.enabled, level: "critical", detail: "receiving wallet for player deposits" },
    { key: "TRON_NETWORK", ok: tron.network === "mainnet", level: "warning", detail: `now: ${tron.network}` },
    { key: "TRONGRID_API_KEY", ok: Boolean(env.TRONGRID_API_KEY), level: "warning", detail: "higher TronGrid rate limits" },
    { key: "DATABASE_URL", ok: !/127\.0\.0\.1|localhost/.test(env.DATABASE_URL ?? ""), level: "critical", detail: "hosted Postgres (Supabase/Neon)" },
    { key: "TELEGRAM_ADMIN_CHAT_ID", ok: Boolean(env.TELEGRAM_ADMIN_CHAT_ID && env.TELEGRAM_BOT_TOKEN), level: "warning", detail: "alerts + daily report" },
    { key: "GEO_BLOCK", ok: env.GEO_BLOCK !== "off", level: "warning", detail: "restricted countries blocked in live mode" },
  ];
  const t = await getTreasuryOnchain().catch(() => null);
  checks.push({
    key: "TREASURY_ONCHAIN",
    ok: t?.status === "ok",
    level: "warning",
    detail: t ? `${t.status} · ${t.usdt ?? "?"} USDT · ${t.trx ?? "?"} TRX` : "unreachable",
  });
  const ready = checks.every((c) => c.ok || c.level !== "critical");
  return { ready, checks };
}
