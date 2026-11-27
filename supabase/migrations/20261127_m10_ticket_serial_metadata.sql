BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'serial'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'ticket_serial'
  ) THEN
    ALTER TABLE "tickets" RENAME COLUMN "serial" TO "ticket_serial";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_serial_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tickets_ticket_serial_unique'
  ) THEN
    ALTER TABLE "tickets" RENAME CONSTRAINT "tickets_serial_unique" TO "tickets_ticket_serial_unique";
  END IF;
END $$;

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "wallet_address" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "transaction_signature" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

COMMIT;
