BEGIN;

ALTER TABLE "draw_commitments"
  ADD COLUMN IF NOT EXISTS "algorithm_version" text DEFAULT 'HMAC-v1' NOT NULL,
  ADD COLUMN IF NOT EXISTS "client_seed_source" text DEFAULT 'EXTERNAL' NOT NULL,
  ADD COLUMN IF NOT EXISTS "nonce_base" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "ticket_snapshot_hash" text;

CREATE TABLE IF NOT EXISTS "draw_reveals" (
  "id" serial PRIMARY KEY NOT NULL,
  "commitment_id" integer NOT NULL,
  "round_id" integer NOT NULL,
  "place" integer NOT NULL,
  "nonce" integer NOT NULL,
  "server_seed" text NOT NULL,
  "client_seed" text NOT NULL,
  "proof_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "draw_reveals_place_valid" CHECK ("place" BETWEEN 1 AND 3)
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "round_winners_place_valid" CHECK ("place" BETWEEN 1 AND 3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_round_place_unique" ON "round_winners" ("round_id", "place");
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_round_ticket_unique" ON "round_winners" ("round_id", "ticket_id");
CREATE UNIQUE INDEX IF NOT EXISTS "round_winners_ledger_reference_unique" ON "round_winners" ("ledger_reference");

COMMIT;
