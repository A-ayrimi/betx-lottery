BEGIN;

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

ALTER TABLE "ledger"
  ADD COLUMN IF NOT EXISTS "event_id" text,
  ADD COLUMN IF NOT EXISTS "direction" text DEFAULT 'DEBIT' NOT NULL,
  ADD COLUMN IF NOT EXISTS "amount_usd" numeric(12, 2) DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "winner_place" integer,
  ADD COLUMN IF NOT EXISTS "before_balance" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "after_balance" numeric(12, 2);

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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "referral_events_event_valid" CHECK ("qualifying_event_type" = 'ROUND_SETTLED')
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

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_event_id_unique" ON "ledger" ("event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "vault_snapshots_event_bucket_unique" ON "vault_snapshots" ("event_id", "bucket");
CREATE UNIQUE INDEX IF NOT EXISTS "treasury_transactions_event_category_unique" ON "treasury_transactions" ("event_id", "category");

COMMIT;
