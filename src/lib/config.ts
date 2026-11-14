/**
 * Central runtime configuration. Everything sensitive comes from env vars.
 *
 * BETX_MODE=live  -> real payments, no demo seed data, no demo top-ups.
 * anything else   -> demo mode (simulated balance, sample activity).
 */
export const config = {
  /** Default is live mode (real TRON wallet, no demo seed data). Set BETX_MODE=demo to test with simulated funds. */
  get live() {
    return (process.env.BETX_MODE || "live") !== "demo";
  },
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get vaultInitial() {
    return Number(process.env.VAULT_INITIAL || "20");
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
  /** Main treasury wallet: every $5 round fee is auto-allocated here. */
  get adminWallet() {
    return (process.env.ADMIN_WALLET || "TN41NBCuPWnReq3TgQJtuLLVmauwgRNVen").trim();
  },
  fees: {
    get autoSweep() {
      return process.env.AUTO_FEE_PAYOUT === "on";
    },
    get sweepThreshold() {
      return Number(process.env.FEE_SWEEP_THRESHOLD || 20);
    },
    get sweepMax() {
      return Number(process.env.FEE_SWEEP_MAX || 500);
    },
  },
  limits: {
    minDeposit: 2,
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
    prizePerRound: 15,
    feePerRound: 5,
    roundCapacity: 20,
    ticketPrice: 1,
  };
}
