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
      return process.env.NOWPAYMENTS_PAY_CURRENCY || "usdttrc20";
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
  /**
   * TRON-only mode: sign-in and deposits work exclusively via the user's own
   * TRON wallet (USDT-TRC20). Telegram / username login and exchange (invoice)
   * deposits are disabled and shown as "coming soon". Re-enable with TRON_ONLY=off.
   */
  get tronOnly() {
    return process.env.TRON_ONLY !== "off";
  },
  /** Treasury destination for verified transfers. */
  get adminWallet() {
    return (process.env.ADMIN_WALLET || "").trim();
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
  return {
    company: process.env.COMPANY_NAME || "BETX",
    license: process.env.LICENSE_INFO || null,
    supportEmail: process.env.SUPPORT_EMAIL || null,
    helpUrl: process.env.GAMBLING_HELP_URL || "https://www.begambleaware.org",
    live: config.live,
    paymentsEnabled: config.nowpayments.enabled,
    botUsername: config.telegram.username || null,
    minDeposit: config.limits.minDeposit,
    minWithdraw: config.limits.minWithdraw,
    referralDepositBonus: config.limits.referralDepositBonus,
    adminWallet: config.adminWallet,
    tronOnly: config.tronOnly,
    totalRoundRevenue: 20,
    prizePerRound: 15,
    treasuryContributionPerRound: 3,
    adminGrossRevenuePerRound: 2,
    roundCapacity: 20,
    ticketPrice: 1,
  };
}
