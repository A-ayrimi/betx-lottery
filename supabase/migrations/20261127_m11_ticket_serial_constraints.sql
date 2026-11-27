BEGIN;

WITH ranked AS (
  SELECT
    ctid,
    ticket_serial,
    round_id,
    row_number() OVER (PARTITION BY ticket_serial ORDER BY created_at, id) AS duplicate_rank,
    row_number() OVER (ORDER BY created_at, id) AS row_rank
  FROM "tickets"
)
UPDATE "tickets" AS t
SET "ticket_serial" =
  'BTX-R' || r.round_id || '-' ||
  translate(upper(substr(md5(r.ctid::text || r.row_rank::text), 1, 12)), '0OI', '123') ||
  translate(lpad(r.row_rank::text, 6, '0'), '0OI', '123') || '-' ||
  translate(upper(substr(md5(r.ctid::text || 'checksum'), 1, 1)), '0OI', '123')
FROM ranked AS r
WHERE t.ctid = r.ctid
  AND (
    t.ticket_serial IS NULL
    OR t.ticket_serial !~ '^BTX-R[0-9]+-[1-9A-HJ-NP-Za-km-z]{10,}-[1-9A-HJ-NP-Za-km-z]$'
    OR r.duplicate_rank > 1
  );

ALTER TABLE "tickets" ALTER COLUMN "ticket_serial" SET NOT NULL;

DO $$
DECLARE
  existing_constraint text;
BEGIN
  SELECT conname INTO existing_constraint
  FROM pg_constraint
  WHERE conrelid = 'tickets'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'tickets'::regclass AND attname = 'ticket_serial')
    ]::smallint[]
  LIMIT 1;

  IF existing_constraint IS NOT NULL AND existing_constraint <> 'tickets_ticket_serial_unique' THEN
    EXECUTE format('ALTER TABLE "tickets" DROP CONSTRAINT %I', existing_constraint);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_serial_unique') THEN
    ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_serial_unique" UNIQUE ("ticket_serial");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "tickets_ticket_serial_lookup_idx" ON "tickets" ("ticket_serial");

COMMIT;
