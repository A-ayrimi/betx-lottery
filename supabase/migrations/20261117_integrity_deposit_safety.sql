BEGIN;

ALTER TABLE "deposits"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "deposits_user_provider_idempotency_unique"
  ON "deposits" ("user_id", "provider", "idempotency_key");

DO $$
DECLARE
  fk record;
  orphan_count bigint;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('deposits', 'deposits_user_id_users_id_fk', 'user_id', 'users'),
      ('fee_transfers', 'fee_transfers_round_id_rounds_id_fk', 'round_id', 'rounds'),
      ('ledger', 'ledger_user_id_users_id_fk', 'user_id', 'users'),
      ('ledger', 'ledger_round_id_rounds_id_fk', 'round_id', 'rounds'),
      ('login_tokens', 'login_tokens_user_id_users_id_fk', 'user_id', 'users'),
      ('rounds', 'rounds_winner_id_users_id_fk', 'winner_id', 'users'),
      ('tickets', 'tickets_round_id_rounds_id_fk', 'round_id', 'rounds'),
      ('tickets', 'tickets_user_id_users_id_fk', 'user_id', 'users'),
      ('vault_snapshots', 'vault_snapshots_round_id_rounds_id_fk', 'round_id', 'rounds'),
      ('wheel_spins', 'wheel_spins_user_id_users_id_fk', 'user_id', 'users'),
      ('withdrawals', 'withdrawals_user_id_users_id_fk', 'user_id', 'users')
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
