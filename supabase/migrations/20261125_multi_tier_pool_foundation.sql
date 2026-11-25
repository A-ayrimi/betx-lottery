BEGIN;

CREATE TABLE IF NOT EXISTS "ticket_tiers" (
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
) ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "rounds"
	ADD COLUMN IF NOT EXISTS "tier_id" integer,
	ADD COLUMN IF NOT EXISTS "tier_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	ADD COLUMN IF NOT EXISTS "closes_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "minimum_participants" integer DEFAULT 1 NOT NULL,
	ADD COLUMN IF NOT EXISTS "maximum_participants" integer;

ALTER TABLE "tickets"
	ADD COLUMN IF NOT EXISTS "tier_id" integer,
	ADD COLUMN IF NOT EXISTS "amount_usd" numeric(12, 2) DEFAULT '1' NOT NULL;

ALTER TABLE "ledger"
	ADD COLUMN IF NOT EXISTS "tier_id" integer;

ALTER TABLE "fee_transfers"
	ADD COLUMN IF NOT EXISTS "tier_id" integer;

ALTER TABLE "vault_snapshots"
	ADD COLUMN IF NOT EXISTS "tier_id" integer;

DO $$
DECLARE
	default_tier_id integer;
BEGIN
	SELECT "id" INTO default_tier_id FROM "ticket_tiers" WHERE "code" = 'usd_1';

	EXECUTE format('UPDATE "rounds" SET "tier_id" = %s WHERE "tier_id" IS NULL', default_tier_id);
	EXECUTE format('UPDATE "tickets" SET "tier_id" = %s WHERE "tier_id" IS NULL', default_tier_id);
	EXECUTE format('UPDATE "ledger" SET "tier_id" = %s WHERE "tier_id" IS NULL', default_tier_id);
	EXECUTE format('UPDATE "fee_transfers" SET "tier_id" = %s WHERE "tier_id" IS NULL', default_tier_id);
	EXECUTE format('UPDATE "vault_snapshots" SET "tier_id" = %s WHERE "tier_id" IS NULL', default_tier_id);

	EXECUTE format('ALTER TABLE "rounds" ALTER COLUMN "tier_id" SET DEFAULT %s', default_tier_id);
	EXECUTE format('ALTER TABLE "tickets" ALTER COLUMN "tier_id" SET DEFAULT %s', default_tier_id);
	EXECUTE format('ALTER TABLE "ledger" ALTER COLUMN "tier_id" SET DEFAULT %s', default_tier_id);
	EXECUTE format('ALTER TABLE "fee_transfers" ALTER COLUMN "tier_id" SET DEFAULT %s', default_tier_id);
	EXECUTE format('ALTER TABLE "vault_snapshots" ALTER COLUMN "tier_id" SET DEFAULT %s', default_tier_id);

	EXECUTE 'ALTER TABLE "rounds" ALTER COLUMN "tier_id" SET NOT NULL';
	EXECUTE 'ALTER TABLE "tickets" ALTER COLUMN "tier_id" SET NOT NULL';
	EXECUTE 'ALTER TABLE "ledger" ALTER COLUMN "tier_id" SET NOT NULL';
	EXECUTE 'ALTER TABLE "fee_transfers" ALTER COLUMN "tier_id" SET NOT NULL';
	EXECUTE 'ALTER TABLE "vault_snapshots" ALTER COLUMN "tier_id" SET NOT NULL';
END $$;

CREATE INDEX IF NOT EXISTS "rounds_tier_id_idx" ON "rounds" ("tier_id");
CREATE INDEX IF NOT EXISTS "tickets_tier_id_idx" ON "tickets" ("tier_id");
CREATE INDEX IF NOT EXISTS "ledger_tier_id_idx" ON "ledger" ("tier_id");
CREATE INDEX IF NOT EXISTS "fee_transfers_tier_id_idx" ON "fee_transfers" ("tier_id");
CREATE INDEX IF NOT EXISTS "vault_snapshots_tier_id_idx" ON "vault_snapshots" ("tier_id");

CREATE TABLE IF NOT EXISTS "draw_commitments" (
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

CREATE INDEX IF NOT EXISTS "draw_commitments_status_idx" ON "draw_commitments" ("status");

CREATE TABLE IF NOT EXISTS "round_settlements" (
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

CREATE INDEX IF NOT EXISTS "round_settlements_tier_id_idx" ON "round_settlements" ("tier_id");

CREATE TABLE IF NOT EXISTS "treasury_transactions" (
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

CREATE INDEX IF NOT EXISTS "treasury_transactions_tier_round_idx" ON "treasury_transactions" ("tier_id", "round_id");
CREATE UNIQUE INDEX IF NOT EXISTS "treasury_transactions_tx_hash_category_unique" ON "treasury_transactions" ("tx_hash", "category");

DO $$
DECLARE
	fk record;
	orphan_count bigint;
BEGIN
	FOR fk IN
		SELECT * FROM (VALUES
			('rounds', 'rounds_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('tickets', 'tickets_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('ledger', 'ledger_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('fee_transfers', 'fee_transfers_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('vault_snapshots', 'vault_snapshots_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('draw_commitments', 'draw_commitments_round_id_rounds_id_fk', 'round_id', 'rounds'),
			('draw_commitments', 'draw_commitments_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('draw_commitments', 'draw_commitments_winner_ticket_id_tickets_id_fk', 'winner_ticket_id', 'tickets'),
			('round_settlements', 'round_settlements_round_id_rounds_id_fk', 'round_id', 'rounds'),
			('round_settlements', 'round_settlements_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('treasury_transactions', 'treasury_transactions_tier_id_ticket_tiers_id_fk', 'tier_id', 'ticket_tiers'),
			('treasury_transactions', 'treasury_transactions_round_id_rounds_id_fk', 'round_id', 'rounds'),
			('treasury_transactions', 'treasury_transactions_ledger_id_ledger_id_fk', 'ledger_id', 'ledger')
		) AS relations(table_name, constraint_name, column_name, parent_table)
	LOOP
		EXECUTE format(
			'SELECT count(*) FROM %I child LEFT JOIN %I parent ON parent.id = child.%I WHERE child.%I IS NOT NULL AND parent.id IS NULL',
			fk.table_name, fk.parent_table, fk.column_name, fk.column_name
		) INTO orphan_count;

		IF orphan_count > 0 THEN
			RAISE EXCEPTION 'Cannot add constraint %: found % orphan row(s) in %.%',
				fk.constraint_name, orphan_count, fk.table_name, fk.column_name;
		END IF;

		IF NOT EXISTS (
			SELECT 1
			FROM pg_constraint
			WHERE conname = fk.constraint_name
				AND conrelid = to_regclass(format('%I', fk.table_name))
		) THEN
			EXECUTE format(
				'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT NOT VALID',
				fk.table_name, fk.constraint_name, fk.column_name, fk.parent_table
			);
		END IF;

		EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', fk.table_name, fk.constraint_name);
	END LOOP;
END $$;

COMMIT;
