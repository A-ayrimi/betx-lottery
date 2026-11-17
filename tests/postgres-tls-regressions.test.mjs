import assert from "node:assert/strict";
import test from "node:test";
import { buildPostgresConfig } from "../src/lib/postgresConfig.ts";

const connectionString = process.env.BETX_TEST_TLS_DATABASE_URL;
const trustedCa = process.env.BETX_TEST_TLS_CA;
const wrongCa = process.env.BETX_TEST_TLS_WRONG_CA;

test(
  "verified PostgreSQL TLS accepts a trusted certificate and rejects an untrusted one",
  {
    skip:
      !connectionString || !trustedCa || !wrongCa
        ? "Requires the isolated local PostgreSQL TLS test harness."
        : false,
  },
  async () => {
    const { Pool } = await import("pg");
    const trusted = new Pool(
      buildPostgresConfig(connectionString, {
        ...process.env,
        DATABASE_SSL: "true",
        DATABASE_SSL_CA: trustedCa,
      }),
    );
    try {
      assert.equal((await trusted.query("SELECT current_database() AS database")).rows[0].database, "betx_phase3_test");
    } finally {
      await trusted.end();
    }

    const untrusted = new Pool(
      buildPostgresConfig(connectionString, {
        ...process.env,
        DATABASE_SSL: "true",
        DATABASE_SSL_CA: wrongCa,
      }),
    );
    try {
      await assert.rejects(untrusted.query("SELECT 1"));
    } finally {
      await untrusted.end();
    }

    assert.throws(
      () =>
        buildPostgresConfig("postgres://test:test@db.example.invalid/betx_phase3_test", {
          ...process.env,
          DATABASE_SSL: "false",
        }),
      /require verified TLS/,
    );
  },
);
