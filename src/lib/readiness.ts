import { config } from "@/lib/config";
import { isValidSolanaAddress, getSolanaConfig } from "@/lib/solana";
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
    { key: "BETX_MODE", ok: !config.live, level: "warning", detail: config.live ? "live mode is not approved during Phase 1" : "demo mode; live operations are not approved" },
    { key: "PHASE1_LIVE_BLOCKER", ok: false, level: "critical", detail: "financial reconciliation, migration, and database integration tests are incomplete" },
    { key: "SOLANA_TREASURY_ADDRESS", ok: isValidSolanaAddress(config.adminWallet), level: "critical", detail: config.adminWallet },
    { key: "SOLANA_USDC_MINT", ok: isValidSolanaAddress(getSolanaConfig().usdcMint), level: "critical", detail: getSolanaConfig().usdcMint },
    { key: "SOLANA_RPC_URL", ok: Boolean(getSolanaConfig().rpcUrl), level: "warning", detail: getSolanaConfig().rpcUrl },
    { key: "DATABASE_URL", ok: !/127\.0\.0\.1|localhost/.test(env.DATABASE_URL ?? ""), level: "critical", detail: "hosted Postgres (Supabase/Neon)" },
    { key: "TELEGRAM_ADMIN_CHAT_ID", ok: Boolean(env.TELEGRAM_ADMIN_CHAT_ID && env.TELEGRAM_BOT_TOKEN), level: "warning", detail: "alerts + daily report" },
    { key: "GEO_BLOCK", ok: env.GEO_BLOCK !== "off", level: "warning", detail: "restricted countries blocked in live mode" },
  ];
  const t = await getTreasuryOnchain().catch(() => null);
  checks.push({
    key: "TREASURY_ONCHAIN",
    ok: t?.status === "ok",
    level: "warning",
    detail: t ? `${t.status} · ${t.usdc ?? "?"} USDC · ${t.sol ?? "?"} SOL` : "unreachable",
  });
  const ready = checks.every((c) => c.ok || c.level !== "critical");
  return { ready, checks };
}
