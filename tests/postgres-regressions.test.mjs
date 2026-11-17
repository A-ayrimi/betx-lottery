import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.BETX_TEST_DATABASE_URL;
const safeDatabaseTarget = (() => {
  if (!databaseUrl) return false;
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\/+/, "");
  return (
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) &&
    /^betx_[a-z0-9_]*test$/i.test(name)
  );
})();

test(
  "PostgreSQL constraints, migration preflight, and concurrent deposit reservations",
  { skip: !databaseUrl ? "Set BETX_TEST_DATABASE_URL to an isolated localhost betx_*test database." : false },
  async () => {
    assert.equal(safeDatabaseTarget, true, "Integration tests accept only a localhost betx_*test database.");

    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { DepositReservationError, reserveDeposit } = await import("../src/lib/depositReservations.ts");
    const schemaSql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    const migrationSql = await readFile(
      new URL("../supabase/migrations/20261117_integrity_deposit_safety.sql", import.meta.url),
      "utf8",
    );

    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const schemaName = `betx_test_${randomUUID().replaceAll("-", "")}`;
    let pool;
    try {
      await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
      pool = new Pool({
        connectionString: databaseUrl,
        max: 10,
        options: `-c search_path=${schemaName}`,
      });
      assert.equal((await pool.query("SELECT current_schema() AS name")).rows[0].name, schemaName);

      await pool.query(schemaSql);
      await pool.query(`
        ALTER TABLE deposits DROP CONSTRAINT deposits_user_id_users_id_fk;
        ALTER TABLE fee_transfers DROP CONSTRAINT fee_transfers_round_id_rounds_id_fk;
        ALTER TABLE ledger DROP CONSTRAINT ledger_user_id_users_id_fk, DROP CONSTRAINT ledger_round_id_rounds_id_fk;
        ALTER TABLE login_tokens DROP CONSTRAINT login_tokens_user_id_users_id_fk;
        ALTER TABLE rounds DROP CONSTRAINT rounds_winner_id_users_id_fk;
        ALTER TABLE tickets DROP CONSTRAINT tickets_round_id_rounds_id_fk, DROP CONSTRAINT tickets_user_id_users_id_fk;
        ALTER TABLE vault_snapshots DROP CONSTRAINT vault_snapshots_round_id_rounds_id_fk;
        ALTER TABLE wheel_spins DROP CONSTRAINT wheel_spins_user_id_users_id_fk;
        ALTER TABLE withdrawals DROP CONSTRAINT withdrawals_user_id_users_id_fk;
      `);

      const preexistingUser = (
        await pool.query(
          "INSERT INTO users (username, display_name, referral_code) VALUES ($1, $2, $3) RETURNING id",
          [`legacy-${randomUUID()}`, "Preexisting Test User", randomUUID().slice(0, 8)],
        )
      ).rows[0];
      const preexistingRound = (await pool.query("INSERT INTO rounds DEFAULT VALUES RETURNING id")).rows[0];
      const financialReference = randomUUID();
      const financialTransactionKey = `test-seed:${randomUUID()}`;
      const preexistingLedger = (
        await pool.query(
          "INSERT INTO ledger (user_id, round_id, type, amount, note, account, reference, transaction_key) VALUES ($1, $2, 'vault_seed', 20, 'preexisting isolated test entry', 'vault_balance', $3, $4) RETURNING id",
          [preexistingUser.id, preexistingRound.id, financialReference, financialTransactionKey],
        )
      ).rows[0];
      await pool.query(migrationSql);
      await pool.query(migrationSql);

      const constraints = await pool.query(
        "SELECT count(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND connamespace = current_schema()::regnamespace",
      );
      assert.equal(constraints.rows[0].count, 11);
      assert.deepEqual(
        (await pool.query(
          "SELECT user_id, round_id, type, amount::text, note, account, reference, transaction_key FROM ledger WHERE id = $1",
          [preexistingLedger.id],
        )).rows[0],
        {
          user_id: preexistingUser.id,
          round_id: preexistingRound.id,
          type: "vault_seed",
          amount: "20.00",
          note: "preexisting isolated test entry",
          account: "vault_balance",
          reference: financialReference,
          transaction_key: financialTransactionKey,
        },
        "Existing isolated financial data must remain unchanged after migration.",
      );

      const user = (
        await pool.query(
          "INSERT INTO users (username, display_name, referral_code) VALUES ($1, $2, $3) RETURNING id",
          [`reg-${randomUUID()}`, "Regression User", randomUUID().slice(0, 8)],
        )
      ).rows[0];
      const round = (await pool.query("INSERT INTO rounds DEFAULT VALUES RETURNING id")).rows[0];

      const validLedger = await pool.query(
        "INSERT INTO ledger (user_id, round_id, type, amount, note) VALUES ($1, $2, 'test', 0, 'valid reference') RETURNING id",
        [user.id, round.id],
      );
      assert.ok(validLedger.rows[0].id);

      const fkProbes = [
        ["INSERT INTO ledger (round_id, type, amount, note) VALUES (-1, 'test', 0, 'invalid round')", []],
        ["INSERT INTO ledger (user_id, type, amount, note) VALUES (-1, 'test', 0, 'invalid user')", []],
        ["INSERT INTO deposits (user_id, order_id, amount_usd) VALUES (-1, $1, 1)", [`bad-dep-${randomUUID()}`]],
        ["INSERT INTO fee_transfers (round_id, amount, admin_wallet) VALUES (-1, 3, 'test')", []],
        ["INSERT INTO login_tokens (token, user_id, expires_at) VALUES ($1, -1, now())", [randomUUID()]],
        ["INSERT INTO rounds (winner_id) VALUES (-1)", []],
        ["INSERT INTO tickets (round_id, user_id, serial, username) VALUES (-1, $1, $2, 'test')", [user.id, randomUUID()]],
        ["INSERT INTO tickets (round_id, user_id, serial, username) VALUES ($1, -1, $2, 'test')", [round.id, randomUUID()]],
        ["INSERT INTO vault_snapshots (balance, reason, round_id) VALUES (0, 'test', -1)", []],
        ["INSERT INTO wheel_spins (user_id, prize) VALUES (-1, 0)", []],
        ["INSERT INTO withdrawals (user_id, username, amount, address) VALUES (-1, 'test', 5, 'test')", []],
      ];
      for (const [query, values] of fkProbes) {
        await assert.rejects(pool.query(query, values), (error) => error.code === "23503");
      }

      await pool.query('ALTER TABLE ledger DROP CONSTRAINT "ledger_round_id_rounds_id_fk"');
      const orphan = (
        await pool.query(
          "INSERT INTO ledger (user_id, round_id, type, amount, note) VALUES ($1, -99, 'test', 0, 'orphan preflight probe') RETURNING id",
          [user.id],
        )
      ).rows[0];
      await assert.rejects(pool.query(migrationSql), /orphan row\(s\).*ledger\.round_id/);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS count FROM ledger WHERE id = $1", [orphan.id])).rows[0].count,
        1,
        "A failed migration must leave the pre-existing orphan untouched.",
      );
      await pool.query("DELETE FROM ledger WHERE id = $1", [orphan.id]);
      await pool.query(migrationSql);

      const limitUser = (
        await pool.query(
          "INSERT INTO users (username, display_name, referral_code, deposit_limit_daily) VALUES ($1, $2, $3, 5) RETURNING id",
          [`limit-${randomUUID()}`, "Limit User", randomUUID().slice(0, 8)],
        )
      ).rows[0];
      const db = drizzle(pool);
      const requests = Array.from({ length: 10 }, () =>
        reserveDeposit(db, {
          userId: limitUser.id,
          provider: "tron",
          amount: 1,
          orderId: `TRX-${randomUUID()}`,
          idempotencyKey: randomUUID(),
        }),
      );
      const outcomes = await Promise.allSettled(requests);
      assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 5);
      assert.equal(
        outcomes.filter(
          (result) => result.status === "rejected" && result.reason instanceof DepositReservationError && result.reason.code === "daily_limit",
        ).length,
        5,
      );
      const reserved = await pool.query(
        "SELECT coalesce(sum(amount_usd), 0)::numeric AS total FROM deposits WHERE user_id = $1 AND status = 'waiting'",
        [limitUser.id],
      );
      assert.equal(Number(reserved.rows[0].total), 5);

      const key = randomUUID();
      const idempotentUser = (
        await pool.query(
          "INSERT INTO users (username, display_name, referral_code, deposit_limit_daily) VALUES ($1, $2, $3, 10) RETURNING id",
          [`idem-${randomUUID()}`, "Idempotency User", randomUUID().slice(0, 8)],
        )
      ).rows[0];
      const reservation = {
        userId: idempotentUser.id,
        provider: "tron",
        amount: 1,
        idempotencyKey: key,
      };
      await reserveDeposit(db, { ...reservation, orderId: `TRX-${randomUUID()}` });
      await assert.rejects(
        reserveDeposit(db, { ...reservation, orderId: `TRX-${randomUUID()}` }),
        (error) => error instanceof DepositReservationError && error.code === "idempotency_conflict",
      );
    } finally {
      if (pool) await pool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
  },
);
