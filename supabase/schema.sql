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
	"provider" text DEFAULT 'solana' NOT NULL,
	"order_id" text NOT NULL,
	"invoice_id" text,
	"payment_id" text,
	"amount_usd" numeric(12, 2) NOT NULL,
	"pay_currency" text DEFAULT 'USDC' NOT NULL,
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
	"ticket_serial" text NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"wallet_address" text,
	"transaction_signature" text,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "tickets_ticket_serial_unique" UNIQUE("ticket_serial")
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
	"network" text DEFAULT 'Solana' NOT NULL,
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

-- ═══════════════════════════ PHASE 1B — ADDITIVE SCHEMA ═══════════════════════════

ALTER TABLE "ticket_tiers"
  ADD COLUMN IF NOT EXISTS "tier_number" integer,
  ADD COLUMN IF NOT EXISTS "winner_count" integer DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS "max_user_pool_percent" integer DEFAULT 20 NOT NULL,
  ADD COLUMN IF NOT EXISTS "refund_window_hours" integer DEFAULT 72 NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_level_required" text DEFAULT 'BASIC' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vault_growth_percentage" numeric(5, 2) DEFAULT '80' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vault_development_percentage" numeric(5, 2) DEFAULT '20' NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "age_status" text DEFAULT 'UNVERIFIED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "date_of_birth" date,
  ADD COLUMN IF NOT EXISTS "age_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "terms_version_accepted" text,
  ADD COLUMN IF NOT EXISTS "kyc_status" text DEFAULT 'NOT_STARTED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_level" text DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_provider_ref" text,
  ADD COLUMN IF NOT EXISTS "kyc_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "kyc_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "country_at_signup" text,
  ADD COLUMN IF NOT EXISTS "sanctions_status" text DEFAULT 'NOT_SCREENED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "referrer_user_id" integer,
  ADD COLUMN IF NOT EXISTS "lifetime_withdrawn_usd" numeric(12, 2) DEFAULT '0' NOT NULL;

ALTER TABLE "rounds"
  ADD COLUMN IF NOT EXISTS "tier_policy_version_id" integer,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "total_pool_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "prize_total_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vault_total_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "site_total_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "rollover_to_round_id" integer,
  ADD COLUMN IF NOT EXISTS "refund_policy" text DEFAULT 'NONE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "commitment_id" integer,
  ADD COLUMN IF NOT EXISTS "settlement_id" integer;

ALTER TABLE "tickets"
  ADD COLUMN IF NOT EXISTS "tier_policy_version_id" integer,
  ADD COLUMN IF NOT EXISTS "purchase_ledger_id" integer,
  ADD COLUMN IF NOT EXISTS "refunded" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "rolled_over_to_ticket_id" integer,
  ADD COLUMN IF NOT EXISTS "kyc_level_at_purchase" text DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "jurisdiction_at_purchase" text,
  ADD COLUMN IF NOT EXISTS "terms_version" text;

ALTER TABLE "draw_commitments"
  ADD COLUMN IF NOT EXISTS "algorithm_version" text DEFAULT 'HMAC-v1' NOT NULL,
  ADD COLUMN IF NOT EXISTS "client_seed_source" text DEFAULT 'EXTERNAL' NOT NULL,
  ADD COLUMN IF NOT EXISTS "nonce_base" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "ticket_snapshot_hash" text;

ALTER TABLE "ledger"
  ADD COLUMN IF NOT EXISTS "event_id" text,
  ADD COLUMN IF NOT EXISTS "direction" text DEFAULT 'DEBIT' NOT NULL,
  ADD COLUMN IF NOT EXISTS "amount_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "winner_place" integer,
  ADD COLUMN IF NOT EXISTS "before_balance" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "after_balance" numeric(12, 2);

ALTER TABLE "vault"
  ADD COLUMN IF NOT EXISTS "growth_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "reserve_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "locked_reserve_floor_usd" numeric(12, 2) DEFAULT '0' NOT NULL;

ALTER TABLE "vault_snapshots"
  ADD COLUMN IF NOT EXISTS "bucket" text DEFAULT 'GROWTH' NOT NULL,
  ADD COLUMN IF NOT EXISTS "balance_after_usd" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "event_id" text;

ALTER TABLE "treasury_transactions"
  ADD COLUMN IF NOT EXISTS "event_id" text,
  ADD COLUMN IF NOT EXISTS "signature_status" text DEFAULT 'UNVERIFIED' NOT NULL;

CREATE TABLE IF NOT EXISTS "tier_policy_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier_id" integer NOT NULL,
	"version" integer NOT NULL,
	"price_usd" numeric(12, 2) NOT NULL,
	"capacity" integer NOT NULL,
	"prize_percent" numeric(5, 2) NOT NULL,
	"vault_percent" numeric(5, 2) NOT NULL,
	"site_percent" numeric(5, 2) NOT NULL,
	"winner_amounts_usd" jsonb NOT NULL,
	"vault_growth_percent" numeric(5, 2) DEFAULT '80' NOT NULL,
	"vault_development_percent" numeric(5, 2) DEFAULT '20' NOT NULL,
	"referral_rate_percent" numeric(5, 2) DEFAULT '2' NOT NULL,
	"referral_event_timing" text DEFAULT 'POST_SETTLEMENT' NOT NULL,
	"referral_blocked_on_refund" boolean DEFAULT true NOT NULL,
	"weekly_jackpot_enabled" boolean DEFAULT true NOT NULL,
	"weekly_jackpot_schedule" text DEFAULT 'SUNDAY_0000_UTC' NOT NULL,
	"weekly_jackpot_split" jsonb DEFAULT '[50,30,20]'::jsonb NOT NULL,
	"consolation_spin_enabled" boolean DEFAULT true NOT NULL,
	"consolation_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consolation_fallback" text DEFAULT 'LOYALTY_CREDIT' NOT NULL,
	"refund_window_hours" integer DEFAULT 72 NOT NULL,
	"refund_destination" text DEFAULT 'WALLET' NOT NULL,
	"rollover_target_policy" text DEFAULT 'SAME_TIER_NEXT_ACTIVE' NOT NULL,
	"kyc_cumulative_threshold_usd" numeric(12, 2) DEFAULT '500' NOT NULL,
	"kyc_cumulative_window" text DEFAULT 'LIFETIME' NOT NULL,
	"age_minimum" integer DEFAULT 18 NOT NULL,
	"age_enforcement" text DEFAULT 'SERVER' NOT NULL,
	"geo_block_enforcement" text DEFAULT 'SERVER' NOT NULL,
	"blocked_jurisdictions" jsonb DEFAULT '["US","KP","IR","SY","CU","RU","BY","MM","AF"]'::jsonb NOT NULL,
	"vrf_provider_interface" text DEFAULT 'MODULAR_PROVIDER' NOT NULL,
	"kyc_provider_interface" text DEFAULT 'MODULAR_PROVIDER' NOT NULL,
	"live_fail_closed_until_provider_verified" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_policy_versions_winners_valid" CHECK (jsonb_array_length("winner_amounts_usd") = 3),
	CONSTRAINT "tier_policy_versions_percentages_valid" CHECK ((("prize_percent" + "vault_percent" + "site_percent") = 100)),
	CONSTRAINT "tier_policy_versions_vault_split_valid" CHECK ((("vault_growth_percent" + "vault_development_percent") = 100)),
	CONSTRAINT "tier_policy_versions_referral_timing_valid" CHECK ("referral_event_timing" = 'POST_SETTLEMENT'),
	CONSTRAINT "tier_policy_versions_refund_valid" CHECK ("refund_destination" = 'WALLET' AND "rollover_target_policy" = 'SAME_TIER_NEXT_ACTIVE'),
	CONSTRAINT "tier_policy_versions_kyc_valid" CHECK ("kyc_cumulative_window" = 'LIFETIME' AND "age_minimum" = 18 AND "age_enforcement" = 'SERVER' AND "geo_block_enforcement" = 'SERVER')
);
CREATE UNIQUE INDEX IF NOT EXISTS "tier_policy_versions_tier_version_unique" ON "tier_policy_versions" ("tier_id", "version");

CREATE TABLE IF NOT EXISTS "round_user_exposure" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tickets_count" integer DEFAULT 0 NOT NULL,
	"max_tickets_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round_user_exposure_round_user_unique" ON "round_user_exposure" ("round_id", "user_id");

CREATE TABLE IF NOT EXISTS "draw_reveals" (
	"id" serial PRIMARY KEY NOT NULL,
	"commitment_id" integer NOT NULL,
	"round_id" integer NOT NULL,
	"place" integer NOT NULL,
	"nonce" integer NOT NULL,
	"server_seed" text NOT NULL,
	"client_seed" text NOT NULL,
	"proof_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "draw_reveals_commitment_nonce_unique" ON "draw_reveals" ("commitment_id", "nonce");
CREATE UNIQUE INDEX IF NOT EXISTS "draw_reveals_round_place_unique" ON "draw_reveals" ("round_id", "place");

CREATE TABLE IF NOT EXISTS "round_winners" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"place" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"reveal_id" integer,
	"ledger_reference" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_round_place_unique" ON "round_winners" ("round_id", "place");
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_round_ticket_unique" ON "round_winners" ("round_id", "ticket_id");
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_ledger_reference_unique" ON "round_winners" ("ledger_reference");

CREATE TABLE IF NOT EXISTS "referral_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"inviter_user_id" integer NOT NULL,
	"invitee_user_id" integer NOT NULL,
	"qualifying_event_type" text DEFAULT 'ROUND_SETTLED' NOT NULL,
	"source_round_id" integer,
	"settlement_id" integer,
	"source_amount_usd" numeric(12, 2) NOT NULL,
	"rate_percent" numeric(5, 2) DEFAULT '2' NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"growth_bucket_ledger_id" integer,
	"blocked_by_refund" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_events_invitee_source_unique" ON "referral_events" ("invitee_user_id", "qualifying_event_type", "source_round_id");

CREATE TABLE IF NOT EXISTS "weekly_jackpots" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"allocated_amount_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
	"eligibility_rule_version" text DEFAULT 'TICKET_POINTS_SETTLED_V1' NOT NULL,
	"winner_user_id" integer,
	"place" integer,
	"amount_usd" numeric(12, 2),
	"proof_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_jackpots_period_place_unique" ON "weekly_jackpots" ("period_start", "place");

CREATE TABLE IF NOT EXISTS "site_revenue_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"tier_id" integer NOT NULL,
	"tier_policy_version_id" integer,
	"total_pool_usd" numeric(12, 2) NOT NULL,
	"site_percent" numeric(5, 2) NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"ledger_reference" text,
	"status" text DEFAULT 'ACCRUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_revenue_entries_round_unique" ON "site_revenue_entries" ("round_id");

CREATE TABLE IF NOT EXISTS "refunds_and_rollovers" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"policy" text NOT NULL,
	"ticket_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount_usd" numeric(12, 2) NOT NULL,
	"target_round_id" integer,
	"ledger_event_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_rollovers_policy_valid" CHECK ("policy" IN ('REFUND', 'ROLLOVER'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_rollovers_round_user_policy_unique" ON "refunds_and_rollovers" ("round_id", "user_id", "policy");

CREATE TABLE IF NOT EXISTS "kyc_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reviewer_operator_id" integer,
	"decision" text NOT NULL,
	"reason" text,
	"evidence_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "jurisdiction_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"request_id" text,
	"country" text,
	"source" text DEFAULT 'TRUSTED_HEADER' NOT NULL,
	"trusted_header_signature" text,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_operators" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_operators_username_unique" ON "admin_operators" ("username");

CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"operator_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"role_snapshot" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token_hash_unique" ON "admin_sessions" ("token_hash");

CREATE TABLE IF NOT EXISTS "admin_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"allowed" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_permissions_role_resource_action_unique" ON "admin_permissions" ("role", "resource", "action");

CREATE TABLE IF NOT EXISTS "admin_audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"operator_id" integer,
	"role_snapshot" text,
	"request_id" text,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"before_hash" text,
	"event_hash" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "integrity_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject_id" text,
	"algorithm_version" text DEFAULT 'PROOF-v1' NOT NULL,
	"hash" text NOT NULL,
	"signature" text,
	"result" text NOT NULL,
	"blocked_reason" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrity_proofs_result_valid" CHECK ("result" IN ('PASS', 'FAIL'))
);

CREATE TABLE IF NOT EXISTS "automation_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"lease_until" timestamp with time zone,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"steps_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"operator_id" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_jobs_trigger_valid" CHECK ("trigger" IN ('CRON', 'ADMIN', 'SYSTEM'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "automation_jobs_idempotency_unique" ON "automation_jobs" ("idempotency_key");

ALTER TABLE "tier_policy_versions"
  ADD CONSTRAINT "tier_policy_versions_tier_id_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT;
ALTER TABLE "round_user_exposure"
  ADD CONSTRAINT "round_user_exposure_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "round_user_exposure_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "draw_reveals"
  ADD CONSTRAINT "draw_reveals_commitment_id_draw_commitments_id_fk"
  FOREIGN KEY ("commitment_id") REFERENCES "draw_commitments"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "draw_reveals_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT;
ALTER TABLE "round_winners"
  ADD CONSTRAINT "round_winners_round_id_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "round_winners_ticket_id_tickets_id_fk"
  FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "round_winners_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "round_winners_reveal_id_draw_reveals_id_fk"
  FOREIGN KEY ("reveal_id") REFERENCES "draw_reveals"("id") ON DELETE RESTRICT;
ALTER TABLE "referral_events"
  ADD CONSTRAINT "referral_events_inviter_users_id_fk"
  FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "referral_events_invitee_users_id_fk"
  FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "referral_events_source_round_rounds_id_fk"
  FOREIGN KEY ("source_round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "referral_events_growth_ledger_ledger_id_fk"
  FOREIGN KEY ("growth_bucket_ledger_id") REFERENCES "ledger"("id") ON DELETE RESTRICT;
ALTER TABLE "weekly_jackpots"
  ADD CONSTRAINT "weekly_jackpots_winner_users_id_fk"
  FOREIGN KEY ("winner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "site_revenue_entries"
  ADD CONSTRAINT "site_revenue_entries_round_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "site_revenue_entries_tier_ticket_tiers_id_fk"
  FOREIGN KEY ("tier_id") REFERENCES "ticket_tiers"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "site_revenue_entries_policy_tier_policy_versions_id_fk"
  FOREIGN KEY ("tier_policy_version_id") REFERENCES "tier_policy_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "refunds_and_rollovers"
  ADD CONSTRAINT "refunds_rollovers_round_rounds_id_fk"
  FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "refunds_rollovers_user_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "kyc_reviews"
  ADD CONSTRAINT "kyc_reviews_user_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "jurisdiction_checks"
  ADD CONSTRAINT "jurisdiction_checks_user_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "admin_sessions"
  ADD CONSTRAINT "admin_sessions_operator_admin_operators_id_fk"
  FOREIGN KEY ("operator_id") REFERENCES "admin_operators"("id") ON DELETE RESTRICT;
ALTER TABLE "admin_audit_events"
  ADD CONSTRAINT "admin_audit_events_operator_admin_operators_id_fk"
  FOREIGN KEY ("operator_id") REFERENCES "admin_operators"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_event_id_unique" ON "ledger" ("event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vault_snapshots_event_bucket_unique" ON "vault_snapshots" ("event_id", "bucket");
CREATE UNIQUE INDEX IF NOT EXISTS "treasury_transactions_event_category_unique" ON "treasury_transactions" ("event_id", "category");

UPDATE "ticket_tiers" SET "status" = 'ARCHIVED' WHERE "code" = 'usd_1' AND "status" = 'ACTIVE';
INSERT INTO "ticket_tiers" ("code", "name", "price_usd", "ticket_capacity", "draw_duration_minutes", "prize_percentage", "treasury_percentage", "admin_percentage", "tier_number", "status", "display_order")
VALUES
  ('starter_1', 'Starter $1', '1', 50, 4320, '75', '15', '10', 1, 'ACTIVE', 1),
  ('bronze_5', 'Bronze $5', '5', 40, 4320, '75', '15', '10', 2, 'ACTIVE', 2),
  ('silver_10', 'Silver $10', '10', 30, 4320, '75', '15', '10', 3, 'ACTIVE', 3),
  ('gold_25', 'Gold $25', '25', 20, 4320, '75', '15', '10', 4, 'ACTIVE', 4),
  ('platinum_50', 'Platinum $50', '50', 20, 4320, '80', '12', '8', 5, 'ACTIVE', 5),
  ('diamond_100', 'Diamond $100', '100', 15, 4320, '80', '12', '8', 6, 'ACTIVE', 6),
  ('vip_whale_200', 'VIP Whale $200', '200', 10, 4320, '80', '12', '8', 7, 'ACTIVE', 7)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "tier_policy_versions" ("tier_id", "version", "price_usd", "capacity", "prize_percent", "vault_percent", "site_percent", "winner_amounts_usd", "consolation_rewards")
SELECT t."id", 1, t."price_usd", t."ticket_capacity", t."prize_percentage", t."treasury_percentage", t."admin_percentage",
  CASE t."code"
    WHEN 'starter_1' THEN '["30","5","2.50"]'::jsonb
    WHEN 'bronze_5' THEN '["120","20","10"]'::jsonb
    WHEN 'silver_10' THEN '["180","30","15"]'::jsonb
    WHEN 'gold_25' THEN '["300","50","25"]'::jsonb
    WHEN 'platinum_50' THEN '["650","100","50"]'::jsonb
    WHEN 'diamond_100' THEN '["975","150","75"]'::jsonb
    WHEN 'vip_whale_200' THEN '["1300","200","100"]'::jsonb
  END,
  '[{"amount_usd":"0.05","probability_percent":45},{"amount_usd":"0.10","probability_percent":30},{"amount_usd":"0.25","probability_percent":15},{"amount_usd":"0.50","probability_percent":7},{"amount_usd":"1.00","probability_percent":3}]'::jsonb
FROM "ticket_tiers" t
WHERE t."code" IN ('starter_1','bronze_5','silver_10','gold_25','platinum_50','diamond_100','vip_whale_200')
ON CONFLICT ("tier_id", "version") DO NOTHING;

