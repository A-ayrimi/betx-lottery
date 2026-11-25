import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPostgresConfig } from "../src/lib/postgresConfig.ts";
import { DepositReservationError, isValidDepositIdempotencyKey } from "../src/lib/depositReservations.ts";
import { broadcastSolanaSignedTransaction } from "../src/lib/solana.ts";

test("remote PostgreSQL connections always use certificate verification", () => {
  const config = buildPostgresConfig(
    "postgres://test:test@db.example.invalid/betx?sslmode=disable",
    { DATABASE_SSL: "true", DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----" },
  );
  assert.equal(config.ssl?.rejectUnauthorized, true);
  assert.equal(config.ssl?.ca?.startsWith("-----BEGIN CERTIFICATE-----"), true);
  assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
  assert.throws(
    () => buildPostgresConfig("postgres://test:test@db.example.invalid/betx", { DATABASE_SSL: "false" }),
    /require verified TLS/,
  );
});

test("local PostgreSQL connections require a CA for verified TLS", () => {
  assert.equal(buildPostgresConfig("postgres://test:test@127.0.0.1/betx", {}).ssl, undefined);
  assert.equal(
    buildPostgresConfig("postgres://test:test@127.0.0.1/betx", { DATABASE_SSL: "true" }).ssl?.rejectUnauthorized,
    false,
  );
  assert.equal(
    buildPostgresConfig("postgres://test:test@127.0.0.1/betx", {
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
    }).ssl?.rejectUnauthorized,
    true,
  );
});

test("Solana broadcast rejects unsigned payloads before any RPC call", async () => {
  const result = await broadcastSolanaSignedTransaction("AA==");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /unsigned/i);
});

test("automatic payouts remain hard-disabled and expose no key", () => {
  const source = readFileSync(new URL("../src/lib/payout.ts", import.meta.url), "utf8");
  assert.match(source, /enabled:\s*false/);
  assert.match(source, /keyConfigured:\s*false/);
  assert.doesNotMatch(source, /privateKey|fromSecretKey|Keypair\.fromSecretKey/i);
});

test("deposit reservation keys are UUIDs and duplicate reservations have an explicit error", () => {
  assert.equal(isValidDepositIdempotencyKey("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidDepositIdempotencyKey("not-a-key"), false);
  assert.ok(new DepositReservationError("idempotency_conflict") instanceof Error);
});
