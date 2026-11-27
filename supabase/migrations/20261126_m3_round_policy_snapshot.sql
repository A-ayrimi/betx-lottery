BEGIN;

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

CREATE TABLE IF NOT EXISTS "round_user_exposure" (
  "id" serial PRIMARY KEY NOT NULL,
  "round_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "tickets_count" integer DEFAULT 0 NOT NULL,
  "max_tickets_count" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "round_user_exposure_round_user_unique" ON "round_user_exposure" ("round_id", "user_id");
CREATE INDEX IF NOT EXISTS "rounds_tier_policy_version_id_idx" ON "rounds" ("tier_policy_version_id");
CREATE INDEX IF NOT EXISTS "tickets_tier_policy_version_id_idx" ON "tickets" ("tier_policy_version_id");

COMMIT;
