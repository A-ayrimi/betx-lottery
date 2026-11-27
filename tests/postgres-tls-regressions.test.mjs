import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildPostgresConfig } from "../src/lib/postgresConfig.ts";

const connectionString = process.env.BETX_TEST_TLS_DATABASE_URL;
const trustedCa = process.env.BETX_TEST_TLS_CA;
const wrongCa = process.env.BETX_TEST_TLS_WRONG_CA;
const remoteUrl = "postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
const localUrl = "postgresql://user:pass@127.0.0.1:5432/betx";

function configEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    DATABASE_SSL: undefined,
    DATABASE_SSL_CA: undefined,
    DATABASE_SSL_REJECT_UNAUTHORIZED: undefined,
    ...overrides,
  };
}

test("remote pooled PostgreSQL TLS skips certificate verification in development by default", () => {
  const config = buildPostgresConfig(remoteUrl, configEnv());
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

test("local PostgreSQL connections stay non-TLS by default", () => {
  const config = buildPostgresConfig(localUrl, configEnv());
  assert.equal(config.ssl, undefined);
});

test("verified TLS remains available for CA configs, production, and explicit opt-in", () => {
  const withCa = buildPostgresConfig(remoteUrl, configEnv({ DATABASE_SSL_CA: "test-ca" }));
  assert.deepEqual(withCa.ssl, { ca: "test-ca", rejectUnauthorized: true });

  const production = buildPostgresConfig(remoteUrl, configEnv({ NODE_ENV: "production" }));
  assert.equal(production.ssl.rejectUnauthorized, true);

  const explicitFalse = buildPostgresConfig(remoteUrl, configEnv({ DATABASE_SSL_REJECT_UNAUTHORIZED: "false" }));
  assert.equal(explicitFalse.ssl.rejectUnauthorized, false);
});

test("db pool cache is invalidated when PostgreSQL TLS config changes", async () => {
  const source = await readFile(new URL("../src/db/index.ts", import.meta.url), "utf8");
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /__arenaNextJsPostgresqlPoolConfigKey/);
  assert.match(source, /cachedPool && !configChanged \? cachedPool : new Pool\(postgresConfig\)/);
  assert.match(source, /pool\.on\("error", \(error\) =>/);
  assert.match(source, /NODE_ENV === "production"\) console\.error/);
});

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
