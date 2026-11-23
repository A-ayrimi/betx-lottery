import {
  MAX_DEPOSIT,
  MIN_DEPOSIT,
  MIN_WITHDRAW,
  REFERRAL_DEPOSIT_BONUS,
  SOLANA_CLUSTER,
  SOLANA_EXPLORER,
  SOLANA_MIN_DEPOSIT_USD,
  SOLANA_RPC_URL,
  SOLANA_USDC_MINT,
  ADMIN_GROSS_REVENUE,
  POOL_CAPACITY,
  PRIZE,
  TICKET_PRICE,
  TOTAL_TICKET_REVENUE,
  TREASURY_CONTRIBUTION,
  isMaintenanceMode,
} from "@/lib/gameConfig";

/**
 * Central runtime configuration. Everything sensitive comes from env vars.
 *
 * BETX_MODE=live  -> live application mode (production default).
 * BETX_MODE=demo  -> legacy browser-local preview (no longer the default).
 */
export function getBetxMode(): "live" | "demo" {
  const mode = process.env.BETX_MODE;
  if (mode === "live" || mode === "demo") return mode;
  return "live";
}

export const config = {
  /** Live is the production default; the legacy demo preview is opt-in. */
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
      // Solana SPL-USDC (NOWPayments symbol "usdcsol"); verify in the gateway dashboard.
      return process.env.NOWPAYMENTS_PAY_CURRENCY || "usdcsol";
    },
    get enabled() {
      return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
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
  /** Solana-only mode is always on: only Solana wallets and SPL-USDC are used. */
  get solanaOnly() {
    return process.env.SOLANA_ONLY !== "off";
  },
  /** Treasury destination (Solana) for verified transfers. */
  get adminWallet() {
    return (
      process.env.SOLANA_TREASURY_ADDRESS ||
      process.env.NEXT_PUBLIC_SOLANA_TREASURY_ADDRESS ||
      ""
    ).trim();
  },
  /** Temporary pre-launch maintenance switch (default ON until treasury is funded). */
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
    minDeposit: MIN_DEPOSIT,
    maxDeposit: MAX_DEPOSIT,
    minWithdraw: MIN_WITHDRAW,
    /** referral reward paid to the inviter when an invitee's first deposit lands */
    referralDepositBonus: REFERRAL_DEPOSIT_BONUS,
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
    paymentsEnabled: config.nowpayments.enabled,
    botUsername: config.telegram.username || null,
    minDeposit: config.limits.minDeposit,
    minWithdraw: config.limits.minWithdraw,
    referralDepositBonus: config.limits.referralDepositBonus,
    adminWallet: config.adminWallet,
    solanaOnly: config.solanaOnly,
    solana: {
      enabled: Boolean(solanaTreasury),
      network: process.env.SOLANA_CLUSTER || SOLANA_CLUSTER,
      treasuryAddress: solanaTreasury || null,
      usdcMint: (process.env.SOLANA_USDC_MINT || SOLANA_USDC_MINT).trim(),
      decimals: 6,
      rpcUrl: (process.env.SOLANA_RPC_URL || SOLANA_RPC_URL).trim(),
      explorer: SOLANA_EXPLORER,
    },
    totalRoundRevenue: TOTAL_TICKET_REVENUE,
    prizePerRound: PRIZE,
    treasuryContributionPerRound: TREASURY_CONTRIBUTION,
    adminGrossRevenuePerRound: ADMIN_GROSS_REVENUE,
    roundCapacity: POOL_CAPACITY,
    ticketPrice: TICKET_PRICE,
  };
}