import {
  bigint,
  boolean,
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
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id, { onDelete: "restrict" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  kind: text("kind").notNull().default("gold"), // gold | bronze
  serial: text("serial").notNull().unique(),
  username: text("username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  reference: uuid("reference"),
  transactionKey: text("transaction_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ledger_reference_unique").on(t.reference),
  uniqueIndex("ledger_transaction_key_unique").on(t.transactionKey),
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
  provider: text("provider").notNull().default("nowpayments"), // nowpayments | demo
  orderId: text("order_id").notNull().unique(),
  invoiceId: text("invoice_id"),
  paymentId: text("payment_id"),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 2 }).notNull(),
  payCurrency: text("pay_currency").notNull().default("usdttrc20"),
  status: text("status").notNull().default("waiting"),
  credited: boolean("credited").notNull().default(false),
  invoiceUrl: text("invoice_url"),
  // on-chain (direct wallet) deposits
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
  network: text("network").notNull().default("TRC20"),
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

/** One-time sign-in challenges for wallet login (Sign-In with TRON). */
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

/** On-chain USDT that reached the deposit address from a wallet no user has linked (yet). */
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
 * One row per settled round for the $3 treasury allocation. The separate
 * $2 gross administrator revenue is recorded in the accounting ledger.
 * `paid` is set only after a verified on-chain transfer.
 */
export const feeTransfers = pgTable("fee_transfers", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().unique().references(() => rounds.id, { onDelete: "restrict" }),
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
 * Every real change of the vault balance, recorded in the same transaction
 * as the change itself. This is the source of truth for the candle chart —
 * charts are never invented from random numbers.
 * reason: draw | spin | referral | seed | backfill
 */
export const vaultSnapshots = pgTable("vault_snapshots", {
  id: serial("id").primaryKey(),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
  delta: numeric("delta", { precision: 12, scale: 2 }).notNull().default("0"),
  reason: text("reason").notNull(),
  roundId: integer("round_id").references(() => rounds.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type VaultRow = typeof vault.$inferSelect;
