import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ticketTiers = pgTable("ticket_tiers", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  priceUsd: numeric("price_usd", { precision: 12, scale: 2 }).notNull(),
  ticketCapacity: integer("ticket_capacity").notNull(),
  drawDurationMinutes: integer("draw_duration_minutes").notNull(),
  prizePercentage: numeric("prize_percentage", { precision: 5, scale: 2 }).notNull(),
  treasuryPercentage: numeric("treasury_percentage", { precision: 5, scale: 2 }).notNull(),
  adminPercentage: numeric("admin_percentage", { precision: 5, scale: 2 }).notNull(),
  minimumParticipants: integer("minimum_participants").notNull().default(1),
  maximumParticipants: integer("maximum_participants"),
  rules: jsonb("rules").notNull().default({}),
  status: text("status").notNull().default("INACTIVE"),
  displayOrder: integer("display_order").notNull().default(0),
  tierNumber: integer("tier_number"),
  winnerCount: integer("winner_count").notNull().default(3),
  maxUserPoolPercent: integer("max_user_pool_percent").notNull().default(20),
  refundWindowHours: integer("refund_window_hours").notNull().default(72),
  kycLevelRequired: text("kyc_level_required").notNull().default("BASIC"),
  vaultGrowthPercentage: numeric("vault_growth_percentage", { precision: 5, scale: 2 }).notNull().default("80"),
  vaultDevelopmentPercentage: numeric("vault_development_percentage", { precision: 5, scale: 2 }).notNull().default("20"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("ticket_tiers_code_unique").on(t.code)]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  telegram: text("telegram"),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  telegramId: text("telegram_id").unique(),
  walletAddress: text("wallet_address").unique(),
  payoutAddress: text("payout_address"),
  totalDeposited: numeric("total_deposited", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  // ── international / compliance
  locale: text("locale").notNull().default("en"),
  country: text("country"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  ageStatus: text("age_status").notNull().default("UNVERIFIED"),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  ageVerifiedAt: timestamp("age_verified_at", { withTimezone: true }),
  termsVersionAccepted: text("terms_version_accepted"),
  kycStatus: text("kyc_status").notNull().default("NOT_STARTED"),
  kycLevel: text("kyc_level").notNull().default("0"),
  kycProviderRef: text("kyc_provider_ref"),
  kycVerifiedAt: timestamp("kyc_verified_at", { withTimezone: true }),
  kycExpiresAt: timestamp("kyc_expires_at", { withTimezone: true }),
  countryAtSignup: text("country_at_signup"),
  sanctionsStatus: text("sanctions_status").notNull().default("NOT_SCREENED"),
  referrerUserId: integer("referrer_user_id"),
  lifetimeWithdrawnUsd: numeric("lifetime_withdrawn_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  // ── responsible gaming
  selfExcludedUntil: timestamp("self_excluded_until", { withTimezone: true }),
  depositLimitDaily: numeric("deposit_limit_daily", { precision: 12, scale: 2 }),
  pendingDepositLimit: numeric("pending_deposit_limit", { precision: 12, scale: 2 }),
  pendingLimitAt: timestamp("pending_limit_at", { withTimezone: true }),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  bonusSpins: integer("bonus_spins").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("LOCKED"),
  capacity: integer("capacity").notNull().default(20),
  sold: integer("sold").notNull().default(0),
  prize: numeric("prize", { precision: 12, scale: 2 }).notNull().default("15"),
  fee: numeric("fee", { precision: 12, scale: 2 }).notNull().default("5"),
  treasuryContribution: numeric("treasury_contribution", { precision: 12, scale: 2 }),
  adminGrossRevenue: numeric("admin_gross_revenue", { precision: 12, scale: 2 }),
  tierId: integer("tier_id").notNull().default(1).references(() => ticketTiers.id, { onDelete: "restrict" }),
  tierSnapshot: jsonb("tier_snapshot").notNull().default({}),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  minimumParticipants: integer("minimum_participants").notNull().default(1),
  maximumParticipants: integer("maximum_participants"),
  winnerId: integer("winner_id").references(() => users.id, { onDelete: "restrict" }),
  winnerName: text("winner_name"),
  winningSerial: text("winning_serial"),
  // Provably fair seed data remains public after a draw, but the winner must be reviewed and approved by an administrator.
  seedHash: text("seed_hash"),
  serverSeed: text("server_seed"),
  feeStatus: text("fee_status").notNull().default("pending"), // pending | accrued | queued | paid | failed
  feeTxHash: text("fee_tx_hash"),
  feePaidAt: timestamp("fee_paid_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  drawnAt: timestamp("drawn_at", { withTimezone: true }),
  tierPolicyVersionId: integer("tier_policy_version_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  totalPoolUsd: numeric("total_pool_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  prizeTotalUsd: numeric("prize_total_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  vaultTotalUsd: numeric("vault_total_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  siteTotalUsd: numeric("site_total_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  rolloverToRoundId: integer("rollover_to_round_id"),
  refundPolicy: text("refund_policy").notNull().default("NONE"),
  commitmentId: integer("commitment_id"),
  settlementId: integer("settlement_id"),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  kind: text("kind").notNull().default("gold"), // gold | bronze
  tierId: integer("tier_id").notNull().default(1).references(() => ticketTiers.id, { onDelete: "restrict" }),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull().default("1"),
  ticketSerial: text("ticket_serial").notNull().unique(),
  username: text("username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  walletAddress: text("wallet_address"),
  transactionSignature: text("transaction_signature"),
  status: text("status").notNull().default("active"),
  tierPolicyVersionId: integer("tier_policy_version_id"),
  purchaseLedgerId: integer("purchase_ledger_id"),
  refunded: boolean("refunded").notNull().default(false),
  rolledOverToTicketId: integer("rolled_over_to_ticket_id"),
  kycLevelAtPurchase: text("kyc_level_at_purchase").notNull().default("0"),
  jurisdictionAtPurchase: text("jurisdiction_at_purchase"),
  termsVersion: text("terms_version"),
});

export const drawCommitments = pgTable("draw_commitments", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().references(() => ticketTiers.id, { onDelete: "restrict" }),
  serverSeedHash: text("server_seed_hash").notNull(),
  clientSeed: text("client_seed"),
  drawNonce: integer("draw_nonce").notNull().default(0),
  status: text("status").notNull().default("COMMITTED"),
  winnerTicketId: integer("winner_ticket_id").references(() => tickets.id, { onDelete: "restrict" }),
  winningSerial: text("winning_serial"),
  revealedServerSeed: text("revealed_server_seed"),
  committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  algorithmVersion: text("algorithm_version").notNull().default("HMAC-v1"),
  clientSeedSource: text("client_seed_source").notNull().default("EXTERNAL"),
  nonceBase: integer("nonce_base").notNull().default(0),
  ticketSnapshotHash: text("ticket_snapshot_hash"),
}, (t) => [uniqueIndex("draw_commitments_round_id_unique").on(t.roundId)]);

export const vault = pgTable("vault", {
  id: serial("id").primaryKey(),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
  initialCapital: numeric("initial_capital", { precision: 12, scale: 2 })
    .notNull(),
  totalFees: numeric("total_fees", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPaid: numeric("total_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  treasuryPaid: numeric("treasury_paid", { precision: 12, scale: 2 }),
  roundsCompleted: integer("rounds_completed").notNull().default(0),
  ticketsSold: integer("tickets_sold").notNull().default(0),
  // Treasury destination for verified transfers.
  adminWallet: text("admin_wallet").notNull(),
  adminEarnings: numeric("admin_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
  adminPaid: numeric("admin_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  growthBalance: numeric("growth_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  reserveBalance: numeric("reserve_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  lockedReserveFloorUsd: numeric("locked_reserve_floor_usd", { precision: 12, scale: 2 }).notNull().default("0"),
});

export const ledger = pgTable("ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "restrict" }),
  username: text("username"),
  type: text("type").notNull(), // ticket_buy | prize | spin | fee | referral
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note").notNull().default(""),
  account: text("account"),
  roundId: integer("round_id").references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().default(1).references(() => ticketTiers.id, { onDelete: "restrict" }),
  reference: uuid("reference"),
  transactionKey: text("transaction_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  eventId: text("event_id"),
  direction: text("direction").notNull().default("DEBIT"),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  winnerPlace: integer("winner_place"),
  beforeBalance: numeric("before_balance", { precision: 12, scale: 2 }),
  afterBalance: numeric("after_balance", { precision: 12, scale: 2 }),
}, (t) => [
  uniqueIndex("ledger_reference_unique").on(t.reference),
  uniqueIndex("ledger_transaction_key_unique").on(t.transactionKey),
  uniqueIndex("ledger_event_id_unique").on(t.eventId),
]);

export const roundSettlements = pgTable("round_settlements", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().references(() => ticketTiers.id, { onDelete: "restrict" }),
  totalPool: numeric("total_pool", { precision: 12, scale: 2 }).notNull(),
  winnerAmount: numeric("winner_amount", { precision: 12, scale: 2 }).notNull(),
  treasuryAmount: numeric("treasury_amount", { precision: 12, scale: 2 }).notNull(),
  adminAmount: numeric("admin_amount", { precision: 12, scale: 2 }).notNull(),
  ledgerReference: uuid("ledger_reference"),
  status: text("status").notNull().default("PENDING"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("round_settlements_round_id_unique").on(t.roundId),
  uniqueIndex("round_settlements_ledger_reference_unique").on(t.ledgerReference),
]);

export const treasuryTransactions = pgTable("treasury_transactions", {
  id: serial("id").primaryKey(),
  tierId: integer("tier_id").notNull().references(() => ticketTiers.id, { onDelete: "restrict" }),
  roundId: integer("round_id").references(() => rounds.id, { onDelete: "restrict" }),
  ledgerId: integer("ledger_id").references(() => ledger.id, { onDelete: "restrict" }),
  direction: text("direction").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  walletAddress: text("wallet_address"),
  txHash: text("tx_hash"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  eventId: text("event_id"),
  signatureStatus: text("signature_status").notNull().default("UNVERIFIED"),
}, (t) => [
  index("treasury_transactions_tier_round_idx").on(t.tierId, t.roundId),
  uniqueIndex("treasury_transactions_tx_hash_category_unique").on(t.txHash, t.category),
  uniqueIndex("treasury_transactions_event_category_unique").on(t.eventId, t.category),
]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wheelSpins = pgTable("wheel_spins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  prize: numeric("prize", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deposits = pgTable("deposits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  provider: text("provider").notNull().default("solana"), // solana (SPL-USDC); historical NOWPayments rows preserved
  orderId: text("order_id").notNull().unique(),
  invoiceId: text("invoice_id"),
  paymentId: text("payment_id"),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  payCurrency: text("pay_currency").notNull().default("USDC"),
  status: text("status").notNull().default("waiting"),
  credited: boolean("credited").notNull().default(false),
  invoiceUrl: text("invoice_url"),
  // on-chain (direct Solana wallet) deposits
  txHash: text("tx_hash").unique(),
  fromAddress: text("from_address"),
  expectedTxId: text("expected_tx_id"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("deposits_user_provider_idempotency_unique").on(t.userId, t.provider, t.idempotencyKey)]);

export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  username: text("username").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  address: text("address").notNull(),
  network: text("network").notNull().default("Solana"),
  status: text("status").notNull().default("pending"), // pending | processing | paid | rejected
  auto: boolean("auto").notNull().default(false),
  reviewReason: text("review_reason"),
  txHash: text("tx_hash"),
  expectedTxId: text("expected_tx_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("withdrawals_tx_hash_unique").on(t.txHash)]);

export const loginTokens = pgTable("login_tokens", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** One-time sign-in challenges for wallet login (Sign-In with Solana). */
export const walletNonces = pgTable("wallet_nonces", {
  nonce: text("nonce").primaryKey(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Single-row state of the automation engine (lease lock, cursors, alert throttling). */
export const automationState = pgTable("automation_state", {
  id: text("id").primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastReport: jsonb("last_report"),
  lastError: text("last_error"),
  scanCursor: bigint("scan_cursor", { mode: "number" }),
  lastDailyReportAt: timestamp("last_daily_report_at", { withTimezone: true }),
  alerts: jsonb("alerts").$type<Record<string, { at: string; text: string }>>(),
});

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),
  ok: boolean("ok").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  report: jsonb("report"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** On-chain USDC that reached the deposit address from a wallet no user has linked (yet). */
export const unmatchedTransfers = pgTable("unmatched_transfers", {
  txHash: text("tx_hash").primaryKey(),
  fromAddress: text("from_address").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/**
- One row per settled round for the $3 treasury allocation. The separate
- $2 gross administrator revenue is recorded in the accounting ledger.
- `paid` is set only after a verified on-chain transfer.
 */
export const feeTransfers = pgTable("fee_transfers", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().unique().references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().default(1).references(() => ticketTiers.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  adminWallet: text("admin_wallet").notNull(),
  status: text("status").notNull().default("accrued"), // accrued | queued | processing | paid | failed
  txHash: text("tx_hash"),
  expectedTxId: text("expected_tx_id"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => [uniqueIndex("fee_transfers_tx_hash_unique").on(t.txHash)]);

/**
- Every real change of the vault balance, recorded in the same transaction
- as the change itself. This is the source of truth for the candle chart —
- charts are never invented from random numbers.
- reason: draw | spin | referral | seed | backfill
 */
export const vaultSnapshots = pgTable("vault_snapshots", {
  id: serial("id").primaryKey(),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
  delta: numeric("delta", { precision: 12, scale: 2 }).notNull().default("0"),
  reason: text("reason").notNull(),
  roundId: integer("round_id").references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().default(1).references(() => ticketTiers.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  bucket: text("bucket").notNull().default("GROWTH"),
  balanceAfterUsd: numeric("balance_after_usd", { precision: 12, scale: 2 }),
  eventId: text("event_id"),
}, (t) => [uniqueIndex("vault_snapshots_event_bucket_unique").on(t.eventId, t.bucket)]);

export const tierPolicyVersions = pgTable("tier_policy_versions", {
  id: serial("id").primaryKey(),
  tierId: integer("tier_id").notNull().references(() => ticketTiers.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  priceUsd: numeric("price_usd", { precision: 12, scale: 2 }).notNull(),
  capacity: integer("capacity").notNull(),
  prizePercent: numeric("prize_percent", { precision: 5, scale: 2 }).notNull(),
  vaultPercent: numeric("vault_percent", { precision: 5, scale: 2 }).notNull(),
  sitePercent: numeric("site_percent", { precision: 5, scale: 2 }).notNull(),
  winnerAmountsUsd: jsonb("winner_amounts_usd").$type<string[]>().notNull(),
  vaultGrowthPercent: numeric("vault_growth_percent", { precision: 5, scale: 2 }).notNull().default("80"),
  vaultDevelopmentPercent: numeric("vault_development_percent", { precision: 5, scale: 2 }).notNull().default("20"),
  referralRatePercent: numeric("referral_rate_percent", { precision: 5, scale: 2 }).notNull().default("2"),
  referralEventTiming: text("referral_event_timing").notNull().default("POST_SETTLEMENT"),
  referralBlockedOnRefund: boolean("referral_blocked_on_refund").notNull().default(true),
  weeklyJackpotEnabled: boolean("weekly_jackpot_enabled").notNull().default(true),
  weeklyJackpotSchedule: text("weekly_jackpot_schedule").notNull().default("SUNDAY_0000_UTC"),
  weeklyJackpotSplit: jsonb("weekly_jackpot_split").$type<number[]>().notNull().default([50, 30, 20]),
  consolationSpinEnabled: boolean("consolation_spin_enabled").notNull().default(true),
  consolationRewards: jsonb("consolation_rewards").$type<Array<{ amount_usd: string; probability_percent: number }>>().notNull().default([]),
  consolationFallback: text("consolation_fallback").notNull().default("LOYALTY_CREDIT"),
  refundWindowHours: integer("refund_window_hours").notNull().default(72),
  refundDestination: text("refund_destination").notNull().default("WALLET"),
  rolloverTargetPolicy: text("rollover_target_policy").notNull().default("SAME_TIER_NEXT_ACTIVE"),
  kycCumulativeThresholdUsd: numeric("kyc_cumulative_threshold_usd", { precision: 12, scale: 2 }).notNull().default("500"),
  kycCumulativeWindow: text("kyc_cumulative_window").notNull().default("LIFETIME"),
  ageMinimum: integer("age_minimum").notNull().default(18),
  ageEnforcement: text("age_enforcement").notNull().default("SERVER"),
  geoBlockEnforcement: text("geo_block_enforcement").notNull().default("SERVER"),
  blockedJurisdictions: jsonb("blocked_jurisdictions").$type<string[]>().notNull().default(["US", "KP", "IR", "SY", "CU", "RU", "BY", "MM", "AF"]),
  vrfProviderInterface: text("vrf_provider_interface").notNull().default("MODULAR_PROVIDER"),
  kycProviderInterface: text("kyc_provider_interface").notNull().default("MODULAR_PROVIDER"),
  liveFailClosedUntilProviderVerified: boolean("live_fail_closed_until_provider_verified").notNull().default(true),
  status: text("status").notNull().default("ACTIVE"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tier_policy_versions_tier_version_unique").on(t.tierId, t.version)]);

export const roundUserExposure = pgTable("round_user_exposure", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  ticketsCount: integer("tickets_count").notNull().default(0),
  maxTicketsCount: integer("max_tickets_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("round_user_exposure_round_user_unique").on(t.roundId, t.userId)]);

export const drawReveals = pgTable("draw_reveals", {
  id: serial("id").primaryKey(),
  commitmentId: integer("commitment_id").notNull().references(() => drawCommitments.id, { onDelete: "restrict" }),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  place: integer("place").notNull(),
  nonce: integer("nonce").notNull(),
  serverSeed: text("server_seed").notNull(),
  clientSeed: text("client_seed").notNull(),
  proofPayload: jsonb("proof_payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("draw_reveals_commitment_nonce_unique").on(t.commitmentId, t.nonce),
  uniqueIndex("draw_reveals_round_place_unique").on(t.roundId, t.place),
]);

export const roundWinners = pgTable("round_winners", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  place: integer("place").notNull(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  revealId: integer("reveal_id").references(() => drawReveals.id, { onDelete: "restrict" }),
  ledgerReference: text("ledger_reference"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("round_winners_round_place_unique").on(t.roundId, t.place),
  uniqueIndex("round_winners_round_ticket_unique").on(t.roundId, t.ticketId),
  uniqueIndex("round_winners_ledger_reference_unique").on(t.ledgerReference),
]);

export const referralEvents = pgTable("referral_events", {
  id: serial("id").primaryKey(),
  inviterUserId: integer("inviter_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  inviteeUserId: integer("invitee_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  qualifyingEventType: text("qualifying_event_type").notNull().default("ROUND_SETTLED"),
  sourceRoundId: integer("source_round_id").references(() => rounds.id, { onDelete: "restrict" }),
  settlementId: integer("settlement_id"),
  sourceAmountUsd: numeric("source_amount_usd", { precision: 12, scale: 2 }).notNull(),
  ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull().default("2"),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  growthBucketLedgerId: integer("growth_bucket_ledger_id").references(() => ledger.id, { onDelete: "restrict" }),
  blockedByRefund: boolean("blocked_by_refund").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("referral_events_invitee_source_unique").on(t.inviteeUserId, t.qualifyingEventType, t.sourceRoundId)]);

export const weeklyJackpots = pgTable("weekly_jackpots", {
  id: serial("id").primaryKey(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  allocatedAmountUsd: numeric("allocated_amount_usd", { precision: 12, scale: 2 }).notNull().default("0"),
  eligibilityRuleVersion: text("eligibility_rule_version").notNull().default("TICKET_POINTS_SETTLED_V1"),
  winnerUserId: integer("winner_user_id").references(() => users.id, { onDelete: "restrict" }),
  place: integer("place"),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }),
  proofPayload: jsonb("proof_payload").notNull().default({}),
  status: text("status").notNull().default("PENDING"),
}, (t) => [uniqueIndex("weekly_jackpots_period_place_unique").on(t.periodStart, t.place)]);

export const siteRevenueEntries = pgTable("site_revenue_entries", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  tierId: integer("tier_id").notNull().references(() => ticketTiers.id, { onDelete: "restrict" }),
  tierPolicyVersionId: integer("tier_policy_version_id").references(() => tierPolicyVersions.id, { onDelete: "restrict" }),
  totalPoolUsd: numeric("total_pool_usd", { precision: 12, scale: 2 }).notNull(),
  sitePercent: numeric("site_percent", { precision: 5, scale: 2 }).notNull(),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  ledgerReference: text("ledger_reference"),
  status: text("status").notNull().default("ACCRUED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("site_revenue_entries_round_unique").on(t.roundId)]);

export const refundsAndRollovers = pgTable("refunds_and_rollovers", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  policy: text("policy").notNull(),
  ticketIds: jsonb("ticket_ids").$type<number[]>().notNull().default([]),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  targetRoundId: integer("target_round_id"),
  ledgerEventId: text("ledger_event_id"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("refunds_rollovers_round_user_policy_unique").on(t.roundId, t.userId, t.policy)]);

export const kycReviews = pgTable("kyc_reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewerOperatorId: integer("reviewer_operator_id"),
  decision: text("decision").notNull(),
  reason: text("reason"),
  evidenceRef: text("evidence_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jurisdictionChecks = pgTable("jurisdiction_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "restrict" }),
  requestId: text("request_id"),
  country: text("country"),
  source: text("source").notNull().default("TRUSTED_HEADER"),
  trustedHeaderSignature: text("trusted_header_signature"),
  decision: text("decision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminOperators = pgTable("admin_operators", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  credentialVersion: integer("credential_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  operatorId: integer("operator_id").notNull().references(() => adminOperators.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull().unique(),
  roleSnapshot: text("role_snapshot").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminPermissions = pgTable("admin_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  allowed: boolean("allowed").notNull().default(false),
}, (t) => [uniqueIndex("admin_permissions_role_resource_action_unique").on(t.role, t.resource, t.action)]);

export const adminAuditEvents = pgTable("admin_audit_events", {
  id: serial("id").primaryKey(),
  operatorId: integer("operator_id").references(() => adminOperators.id, { onDelete: "restrict" }),
  roleSnapshot: text("role_snapshot"),
  requestId: text("request_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  beforeHash: text("before_hash"),
  eventHash: text("event_hash").notNull(),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrityProofs = pgTable("integrity_proofs", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(),
  subjectId: text("subject_id"),
  algorithmVersion: text("algorithm_version").notNull().default("PROOF-v1"),
  hash: text("hash").notNull(),
  signature: text("signature"),
  result: text("result").notNull(),
  blockedReason: text("blocked_reason"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationJobs = pgTable("automation_jobs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  status: text("status").notNull().default("PENDING"),
  stepsReport: jsonb("steps_report").notNull().default({}),
  retryCount: integer("retry_count").notNull().default(0),
  operatorId: integer("operator_id"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type TicketTier = typeof ticketTiers.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type DrawCommitment = typeof drawCommitments.$inferSelect;
export type RoundSettlement = typeof roundSettlements.$inferSelect;
export type TreasuryTransaction = typeof treasuryTransactions.$inferSelect;
export type VaultRow = typeof vault.$inferSelect;
export type TierPolicyVersion = typeof tierPolicyVersions.$inferSelect;
export type RoundWinner = typeof roundWinners.$inferSelect;
export type ReferralEvent = typeof referralEvents.$inferSelect;
export type RefundOrRollover = typeof refundsAndRollovers.$inferSelect;
export type IntegrityProof = typeof integrityProofs.$inferSelect;
