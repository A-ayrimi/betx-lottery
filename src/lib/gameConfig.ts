/**
 * Central game economy configuration — single source of truth for the game's
 * numbers, Solana network constants and the maintenance switch.
 *
 * Everything that used to be duplicated across `store.ts`, `config.ts` and
 * `solana.ts` now lives here so a change in one place propagates everywhere.
 */

/* ───────────────────────────────────────────── game economy (USD, SPL-USDC) */

export const TOKEN_SYMBOL = "USDC";
export const TOKEN_LABEL = "USDC (SPL)";

export const TICKET_PRICE = 1;
export const POOL_CAPACITY = 20;
export const TOTAL_TICKET_REVENUE = TICKET_PRICE * POOL_CAPACITY;
export const PRIZE = 15;
export const TREASURY_CONTRIBUTION = 3;
export const ADMIN_GROSS_REVENUE = 2;
export const FEE = TREASURY_CONTRIBUTION + ADMIN_GROSS_REVENUE;
export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Deposit / withdrawal limits (USD). */
export const MIN_DEPOSIT = 1;
export const MAX_DEPOSIT = 500;
export const MIN_WITHDRAW = 5;

/** Referral reward paid to the inviter on an invitee's first qualifying deposit. */
export const REFERRAL_DEPOSIT_BONUS = 0.5;

/* ─────────────────────────────────────────────── Solana network (mainnet-beta) */

export const SOLANA_CLUSTER = "mainnet-beta";
export const SOLANA_NETWORK = "solana";
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_TOKEN_DECIMALS = 6;
export const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
export const SOLANA_EXPLORER = "https://solscan.io";
export const SOLANA_MIN_DEPOSIT_USD = 1;

/* ─────────────────────────────────────────────── maintenance / pre-launch switch */

/**
 * Temporary pre-launch switch. Defaults to `true` (maintenance ON) until the
 * treasury has been funded and the operator flips it to `false`.
 *
 * Server reads `MAINTENANCE_MODE`; the client bundle reads the inlined
 * `NEXT_PUBLIC_MAINTENANCE_MODE`. Set either to `"false"` to go live.
 */
export function isMaintenanceMode(): boolean {
  const raw =
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE ?? process.env.MAINTENANCE_MODE;
  return raw !== "false";
}