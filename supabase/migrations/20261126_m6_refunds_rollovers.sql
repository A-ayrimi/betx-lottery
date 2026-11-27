BEGIN;

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
CREATE UNIQUE INDEX IF NOT EXISTS "refunds_rollovers_ledger_event_unique" ON "refunds_and_rollovers" ("ledger_event_id");

COMMIT;
