BEGIN;

ALTER TABLE "deposits"
  ALTER COLUMN "provider" SET DEFAULT 'solana',
  ALTER COLUMN "pay_currency" SET DEFAULT 'USDC';

ALTER TABLE "withdrawals"
  ALTER COLUMN "network" SET DEFAULT 'Solana';

CREATE INDEX IF NOT EXISTS "treasury_transactions_tier_round_nonunique_idx" ON "treasury_transactions" ("tier_id", "round_id");
CREATE INDEX IF NOT EXISTS "tier_policy_versions_status_effective_idx" ON "tier_policy_versions" ("status", "effective_at");
CREATE INDEX IF NOT EXISTS "integrity_proofs_scope_result_idx" ON "integrity_proofs" ("scope", "result");
CREATE INDEX IF NOT EXISTS "automation_jobs_status_created_idx" ON "automation_jobs" ("status", "created_at");

COMMIT;
