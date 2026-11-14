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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposits_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "deposits_tx_hash_unique" UNIQUE("tx_hash")
);

CREATE TABLE "fee_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"capacity" integer DEFAULT 20 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"prize" numeric(12, 2) DEFAULT '15' NOT NULL,
	"fee" numeric(12, 2) DEFAULT '5' NOT NULL,
	"winner_id" integer,
	"winner_name" text,
	"winning_serial" text,
	"seed_hash" text,
	"server_seed" text,
	"fee_status" text DEFAULT 'pending' NOT NULL,
	"fee_tx_hash" text,
	"fee_paid_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drawn_at" timestamp with time zone
);

CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text DEFAULT 'gold' NOT NULL,
	"serial" text NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_serial_unique" UNIQUE("serial")
);

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
	"balance" numeric(12, 2) DEFAULT '20' NOT NULL,
	"initial_capital" numeric(12, 2) DEFAULT '20' NOT NULL,
	"total_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"rounds_completed" integer DEFAULT 0 NOT NULL,
	"tickets_sold" integer DEFAULT 0 NOT NULL,
	"admin_wallet" text DEFAULT 'TN41NBCuPWnReq3TgQJtuLLVmauwgRNVen' NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

