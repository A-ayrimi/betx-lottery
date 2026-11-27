import { isMaintenanceMode } from "./gameConfig.ts";

/**
 * Central runtime configuration. Everything sensitive comes from env vars.
 *
 * BETX_MODE=live  -> live application mode.
 * BETX_MODE=demo  -> browser-local demo mode.
 */
export function getBetxMode(): "live" | "demo" {
  const mode = process.env.BETX_MODE;
  if (mode === "live" || mode === "demo") return mode;
  throw new Error("BETX_MODE must be explicitly set to live or demo");
}

export const config = {
  /** Mode must be explicitly configured; ambiguous values fail closed. */
  get live() {
    return getBetxMode() === "live";
  },
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get vaultInitial() {
    const raw = process.env.VAULT_INITIAL;
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("VAULT_INITIAL must be explicitly configured before vault initialization");
    }
    return amount;
  },
  nowpayments: {
    get apiKey() {
      return process.env.NOWPAYMENTS_API_KEY || "";
    },
    get ipnSecret() {
      return process.env.NOWPAYMENTS_IPN_SECRET || "";
    },
    get base() {
      return (
        process.env.NOWPAYMENTS_API_BASE || "https://api.nowpayments.io/v1"
      ).replace(/\/$/, "");
    },
    get payCurrency() {
      return process.env.NOWPAYMENTS_PAY_CURRENCY || "usdc";
    },
    get enabled() {
      return false;
    },
  },
  telegram: {
    get token() {
      return process.env.TELEGRAM_BOT_TOKEN || "";
    },
    get username() {
      return (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");
    },
    get webhookSecret() {
      return process.env.TELEGRAM_WEBHOOK_SECRET || "";
    },
    get enabled() {
      return Boolean(process.env.TELEGRAM_BOT_TOKEN);
    },
  },
  get adminToken() {
    return process.env.ADMIN_TOKEN || "";
  },
  get adminViewerToken() {
    return process.env.ADMIN_VIEWER_TOKEN || "";
  },
  /** Compatibility getter for Solana-only mode. */
  get tronOnly() {
    return process.env.SOLANA_ONLY !== "off" && process.env.TRON_ONLY !== "off";
  },
  /** Solana-only mode: only Solana wallets and SPL-USDC are used. */
  get solanaOnly() {
    return process.env.SOLANA_ONLY !== "off";
  },
  /** Treasury destination for verified transfers. */
  get adminWallet() {
    return (
      process.env.SOLANA_TREASURY_ADDRESS ||
      process.env.NEXT_PUBLIC_SOLANA_TREASURY_ADDRESS ||
      process.env.ADMIN_WALLET ||
      ""
    ).trim();
  },
  /** Temporary pre-launch maintenance switch; unset means maintenance is ON. */
  get maintenanceMode() {
    return isMaintenanceMode();
  },
  fees: {
    get autoSweep() {
      return false;
    },
    get sweepThreshold() {
      return Number(process.env.FEE_SWEEP_THRESHOLD || 20);
    },
    get sweepMax() {
      return Number(process.env.FEE_SWEEP_MAX || 500);
    },
  },
  limits: {
    minDeposit: 1,
    maxDeposit: 500,
    minWithdraw: 5,
    /** referral reward paid to the inviter when an invitee's first deposit lands */
    referralDepositBonus: 0.5,
  },
};

export function publicConfig() {
  const solanaTreasury = (
    process.env.SOLANA_TREASURY_ADDRESS ||
    process.env.NEXT_PUBLIC_SOLANA_TREASURY_ADDRESS ||
    ""
  ).trim();
  return {
    company: process.env.COMPANY_NAME || "BETX",
    license: process.env.LICENSE_INFO || null,
    supportEmail: process.env.SUPPORT_EMAIL || "support.betx@gmail.com",
    helpUrl: process.env.GAMBLING_HELP_URL || "https://www.begambleaware.org",
    live: config.live,
    maintenance: config.maintenanceMode,
    maintenanceMode: config.maintenanceMode,
    paymentsEnabled: false,
    botUsername: config.telegram.username || null,
    minDeposit: config.limits.minDeposit,
    minWithdraw: config.limits.minWithdraw,
    referralDepositBonus: config.limits.referralDepositBonus,
    adminWallet: config.adminWallet,
    solanaOnly: config.solanaOnly,
    solana: {
      enabled: Boolean(solanaTreasury),
      network: process.env.SOLANA_CLUSTER || "mainnet-beta",
      treasuryAddress: solanaTreasury || null,
      usdcMint: (process.env.SOLANA_USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").trim(),
      decimals: 6,
      rpcUrl: (process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim(),
      explorer: "https://solscan.io",
    },
    totalRoundRevenue: 50,
    prizePerRound: 37.5,
    treasuryContributionPerRound: 7.5,
    adminGrossRevenuePerRound: 5,
    roundCapacity: 50,
    ticketPrice: 1,
  };
}