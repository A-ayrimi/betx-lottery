BEGIN;

ALTER TABLE "ticket_tiers"
  ADD COLUMN IF NOT EXISTS "tier_number" integer,
  ADD COLUMN IF NOT EXISTS "winner_count" integer DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS "max_user_pool_percent" integer DEFAULT 20 NOT NULL,
  ADD COLUMN IF NOT EXISTS "refund_window_hours" integer DEFAULT 72 NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_level_required" text DEFAULT 'BASIC' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vault_growth_percentage" numeric(5, 2) DEFAULT '80' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vault_development_percentage" numeric(5, 2) DEFAULT '20' NOT NULL;

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

COMMIT;
