BEGIN;

ALTER TABLE "rounds"
  ALTER COLUMN "status" SET DEFAULT 'LOCKED',
  ADD COLUMN IF NOT EXISTS "treasury_contribution" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "admin_gross_revenue" numeric(12, 2),
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "settled_at" timestamp with time zone;

ALTER TABLE "vault"
  ALTER COLUMN "balance" DROP DEFAULT,
  ALTER COLUMN "initial_capital" DROP DEFAULT,
  ALTER COLUMN "admin_wallet" DROP DEFAULT,
  ADD COLUMN IF NOT EXISTS "treasury_paid" numeric(12, 2);

ALTER TABLE "ledger"
  ADD COLUMN IF NOT EXISTS "account" text,
  ADD COLUMN IF NOT EXISTS "round_id" integer,
  ADD COLUMN IF NOT EXISTS "reference" uuid,
  ADD COLUMN IF NOT EXISTS "transaction_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_reference_unique" ON "ledger" ("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_transaction_key_unique" ON "ledger" ("transaction_key");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_transfers_tx_hash_unique" ON "fee_transfers" ("tx_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_tx_hash_unique" ON "withdrawals" ("tx_hash");

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor" text NOT NULL,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" integer NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMIT;
