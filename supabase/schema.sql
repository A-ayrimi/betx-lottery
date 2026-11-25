CREATE TABLE "automation_state" (
	"id" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_report" jsonb,
	"last_error" text,
	"scan_cursor" bigint,
	"last_daily_report_at" timestamp with time zone,
	"alerts" jsonb
);

CREATE TABLE "deposits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text DEFAULT 'nowpayments' NOT NULL,
	"order_id" text NOT NULL,
	"invoice_id" text,
	"payment_id" text,
	"amount_usd" numeric(12, 2) NOT NULL,
	"pay_currency" text DEFAULT 'usdttrc20' NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"credited" boolean DEFAULT false NOT NULL,
	"invoice_url" text,
	"tx_hash" text,
	"from_address" text,
	"expected_tx_id" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "deposits_tx_hash_unique" UNIQUE("tx_hash")
);

CREATE TABLE "fee_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"tier_id" integer DEFAULT 1 NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"admin_wallet" text NOT NULL,
	"status" text DEFAULT 'accrued' NOT NULL,
	"tx_hash" text,
	"expected_tx_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "fee_transfers_round_id_unique" UNIQUE("round_id")
);

CREATE INDEX "fee_transfers_tier_id_idx" ON "fee_transfers" ("tier_id");

CREATE UNIQUE INDEX "fee_transfers_tx_hash_unique" ON "fee_transfers" ("tx_hash");
CREATE UNIQUE INDEX "deposits_user_provider_idempotency_unique" ON "deposits" ("user_id", "provider", "idempotency_key");

CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"ok" boolean NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"account" text,
	"round_id" integer,
	"tier_id" integer DEFAULT 1 NOT NULL,
	"reference" uuid,
	"transaction_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "ledger_tier_id_idx" ON "ledger" ("tier_id");

CREATE UNIQUE INDEX "ledger_reference_unique" ON "ledger" ("reference");
CREATE UNIQUE INDEX "ledger_transaction_key_unique" ON "ledger" ("transaction_key");

CREATE TABLE "login_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);

CREATE TABLE "ticket_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_usd" numeric(12, 2) NOT NULL,
	"ticket_capacity" integer NOT NULL,
	"draw_duration_minutes" integer NOT NULL,
	"prize_percentage" numeric(5, 2) NOT NULL,
	"treasury_percentage" numeric(5, 2) NOT NULL,
	"admin_percentage" numeric(5, 2) NOT NULL,
	"minimum_participants" integer DEFAULT 1 NOT NULL,
	"maximum_participants" integer,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'INACTIVE' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_tiers_code_unique" UNIQUE("code"),
	CONSTRAINT "ticket_tiers_price_usd_positive" CHECK ("price_usd" > 0),
	CONSTRAINT "ticket_tiers_ticket_capacity_positive" CHECK ("ticket_capacity" > 0),
	CONSTRAINT "ticket_tiers_draw_duration_positive" CHECK ("draw_duration_minutes" > 0),
	CONSTRAINT "ticket_tiers_percentages_sum" CHECK ("prize_percentage" + "treasury_percentage" + "admin_percentage" = 100),
	CONSTRAINT "ticket_tiers_status_valid" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
	CONSTRAINT "ticket_tiers_minimum_participants_positive" CHECK ("minimum_participants" > 0),
	CONSTRAINT "ticket_tiers_capacity_bounds" CHECK ("minimum_participants" <= "ticket_capacity" AND ("maximum_participants" IS NULL OR "maximum_participants" <= "ticket_capacity"))
);

INSERT INTO "ticket_tiers" (
	"code", "name", "price_usd", "ticket_capacity", "draw_duration_minutes",
	"prize_percentage", "treasury_percentage", "admin_percentage",
	"minimum_participants", "maximum_participants", "rules", "status", "display_order"
) VALUES (
	'usd_1', '$1 Tier', 1, 20, 1440, 75, 15, 10, 1, 20, '{}'::jsonb, 'ACTIVE', 0
);

CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'LOCKED' NOT NULL,
	"capacity" integer DEFAULT 20 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"prize" numeric(12, 2) DEFAULT '15' NOT NULL,
	"fee" numeric(12, 2) DEFAULT '5' NOT NULL,
	"treasury_contribution" numeric(12, 2),
	"admin_gross_revenue" numeric(12, 2),
	"tier_id" integer DEFAULT 1 NOT NULL,
	"tier_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closes_at" timestamp with time zone,
	"minimum_participants" integer DEFAULT 1 NOT NULL,
	"maximum_participants" integer,
	"winner_id" integer,
	"winner_name" text,
	"winning_serial" text,
	"seed_hash" text,
	"server_seed" text,
	"fee_status" text DEFAULT 'pending' NOT NULL,
	"fee_tx_hash" text,
	"fee_paid_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"drawn_at" timestamp with time zone
);

CREATE INDEX "rounds_tier_id_idx" ON "rounds" ("tier_id");

CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tier_id" integer DEFAULT 1 NOT NULL,
	"amount_usd" numeric(12, 2) DEFAULT '1' NOT NULL,
	"kind" text DEFAULT 'gold' NOT NULL,
	"serial" text NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_serial_unique" UNIQUE("serial")
);

CREATE INDEX "tickets_tier_id_idx" ON "tickets" ("tier_id");

CREATE TABLE "unmatched_transfers" (
	"tx_hash" text PRIMARY KEY NOT NULL,
	"from_address" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"telegram" text,
	"referral_code" text NOT NULL,
	"referred_by" text,
	"telegram_id" text,
	"wallet_address" text,
	"payout_address" text,
	"total_deposited" numeric(12, 2) DEFAULT '0' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"country" text,
	"terms_accepted_at" timestamp with time zone,
	"self_excluded_until" timestamp with time zone,
	"deposit_limit_daily" numeric(12, 2),
	"pending_deposit_limit" numeric(12, 2),
	"pending_limit_at" timestamp with time zone,
	"balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bonus_spins" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id"),
	CONSTRAINT "users_wallet_address_unique" UNIQUE("wallet_address")
);

CREATE TABLE "vault" (
	"id" serial PRIMARY KEY NOT NULL,
	"balance" numeric(12, 2) NOT NULL,
	"initial_capital" numeric(12, 2) NOT NULL,
	"total_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"treasury_paid" numeric(12, 2),
	"rounds_completed" integer DEFAULT 0 NOT NULL,
	"tickets_sold" integer DEFAULT 0 NOT NULL,
	"admin_wallet" text NOT NULL,
	"admin_earnings" numeric(12, 2) DEFAULT '0' NOT NULL,
	"admin_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "vault_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"balance" numeric(12, 2) NOT NULL,
	"delta" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"round_id" integer,
	"tier_id" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "vault_snapshots_tier_id_idx" ON "vault_snapshots" ("tier_id");

CREATE TABLE "wallet_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"message" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE TABLE "wheel_spins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"prize" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"address" text NOT NULL,
	"network" text DEFAULT 'TRC20' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"tx_hash" text,
	"expected_tx_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);

CREATE UNIQUE INDEX "withdrawals_tx_hash_unique" ON "withdrawals" ("tx_hash");

CREATE TABLE "draw_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"tier_id" integer NOT NULL,
	"server_seed_hash" text NOT NULL,
	"client_seed" text,
	"draw_nonce" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'COMMITTED' NOT NULL,
	"winner_ticket_id" integer,
	"winning_serial" text,
	"revealed_server_seed" text,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revealed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draw_commitments_round_id_unique" UNIQUE("round_id"),
	CONSTRAINT "draw_commitments_status_valid" CHECK ("status" IN ('COMMITTED', 'REVEALED', 'CANCELLED'))
);

CREATE INDEX "draw_commitments_status_idx" ON "draw_commitments" ("status");

CREATE TABLE "round_settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"tier_id" integer NOT NULL,
	"total_pool" numeric(12, 2) NOT NULL,
	"winner_amount" numeric(12, 2) NOT NULL,
	"treasury_amount" numeric(12, 2) NOT NULL,
	"admin_amount" numeric(12, 2) NOT NULL,
	"ledger_reference" uuid,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_settlements_round_id_unique" UNIQUE("round_id"),
	CONSTRAINT "round_settlements_ledger_reference_unique" UNIQUE("ledger_reference"),
	CONSTRAINT "round_settlements_amounts_nonnegative" CHECK (
		"total_pool" >= 0 AND "winner_amount" >= 0 AND "treasury_amount" >= 0 AND "admin_amount" >= 0
	),
	CONSTRAINT "round_settlements_amounts_balanced" CHECK (
		"total_pool" = "winner_amount" + "treasury_amount" + "admin_amount"
	),
	CONSTRAINT "round_settlements_status_valid" CHECK ("status" IN ('PENDING', 'POSTED', 'FAILED'))
);

CREATE INDEX "round_settlements_tier_id_idx" ON "round_settlements" ("tier_id");

CREATE TABLE "treasury_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier_id" integer NOT NULL,
	"round_id" integer,
	"ledger_id" integer,
	"direction" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"wallet_address" text,
	"tx_hash" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "treasury_transactions_direction_valid" CHECK ("direction" IN ('IN', 'OUT')),
	CONSTRAINT "treasury_transactions_amount_positive" CHECK ("amount" > 0),
	CONSTRAINT "treasury_transactions_status_valid" CHECK ("status" IN ('PENDING', 'POSTED', 'FAILED'))
);

CREATE INDEX "treasury_transactions_tier_round_idx" ON "treasury_transactions" ("tier_id", "round_id");
CREATE UNIQUE INDEX "treasury_transactions_tx_hash_category_unique" ON "treasury_transactions" ("tx_hash", "category");

ALTER TABLE "deposits"
  ADD CONSTRAINT "deposits_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "fee_transfers"
  ADD CONSTRAINT "fee_transfers_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT;
ALTER TABLE "ledger"
  ADD CONSTRAINT "ledger_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ledger_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT;
ALTER TABLE "login_tokens"
  ADD CONSTRAINT "login_tokens_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_winner_id_users_id_fk"
  FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "tickets_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vault_snapshots"
  ADD CONSTRAINT "vault_snapshots_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT;
ALTER TABLE "wheel_spins"
  ADD CONSTRAINT "wheel_spins_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "withdrawals"
  ADD CONSTRAINT "withdrawals_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "ledger"
  ADD CONSTRAINT "ledger_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "fee_transfers"
  ADD CONSTRAINT "fee_transfers_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "vault_snapshots"
  ADD CONSTRAINT "vault_snapshots_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "draw_commitments"
  ADD CONSTRAINT "draw_commitments_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "draw_commitments_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "draw_commitments_winner_ticket_id_tickets_id_fk"
  FOREIGN KEY ("winner_ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT;
ALTER TABLE "round_settlements"
  ADD CONSTRAINT "round_settlements_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "round_settlements_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "treasury_transactions"
  ADD CONSTRAINT "treasury_transactions_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "treasury_transactions_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "treasury_transactions_ledger_id_ledger_id_fk"
  FOREIGN KEY ("ledger_id") REFERENCES "ledger"("id") ON DELETE RESTRICT;

