BEGIN;

ALTER TABLE "ticket_tiers"
  ALTER COLUMN "winner_count" SET DEFAULT 1;

UPDATE "ticket_tiers" SET "winner_count" = 1 WHERE "winner_count" IS DISTINCT FROM 1;

ALTER TABLE "tier_policy_versions"
  DROP CONSTRAINT IF EXISTS "tier_policy_versions_winners_valid";

UPDATE "tier_policy_versions"
  SET "winner_amounts_usd" = jsonb_build_array("winner_amounts_usd" -> 0)
  WHERE jsonb_array_length("winner_amounts_usd") > 1;

ALTER TABLE "tier_policy_versions"
  ADD CONSTRAINT "tier_policy_versions_winners_valid" CHECK (jsonb_array_length("winner_amounts_usd") = 1);

ALTER TABLE "tier_policy_versions"
  ALTER COLUMN "weekly_jackpot_split" SET DEFAULT '[100]'::jsonb;

UPDATE "tier_policy_versions"
  SET "weekly_jackpot_split" = '[100]'::jsonb
  WHERE jsonb_array_length("weekly_jackpot_split") > 1;

DELETE FROM "round_winners" WHERE "place" > 1;
DELETE FROM "draw_reveals" WHERE "place" > 1;

ALTER TABLE "round_winners" DROP CONSTRAINT IF EXISTS "round_winners_place_valid";
ALTER TABLE "round_winners" ADD CONSTRAINT "round_winners_place_valid" CHECK ("place" = 1);
ALTER TABLE "draw_reveals" DROP CONSTRAINT IF EXISTS "draw_reveals_place_valid";
ALTER TABLE "draw_reveals" ADD CONSTRAINT "draw_reveals_place_valid" CHECK ("place" = 1);

ALTER TABLE "rounds"
  ALTER COLUMN "capacity" SET DEFAULT 50,
  ALTER COLUMN "prize" SET DEFAULT '37.5',
  ALTER COLUMN "fee" SET DEFAULT '12.5';

COMMIT;
