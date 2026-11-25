import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPostgresConfig } from "../src/lib/postgresConfig.ts";
import { DepositReservationError, isValidDepositIdempotencyKey } from "../src/lib/depositReservations.ts";
import { broadcast, broadcastSolanaSignedTransaction, isSolanaBroadcastAuthorized } from "../src/lib/solana.ts";

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

test("local PostgreSQL connections require verified TLS when explicitly enabled", () => {
  assert.equal(buildPostgresConfig("postgres://test:test@127.0.0.1/betx", {}).ssl, undefined);
  assert.equal(
    buildPostgresConfig("postgres://test:test@127.0.0.1/betx", { DATABASE_SSL: "true" }).ssl?.rejectUnauthorized,
    true,
  );
  assert.equal(
    buildPostgresConfig("postgres://test:test@127.0.0.1/betx", {
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----",
    }).ssl?.rejectUnauthorized,
    true,
  );
});

test("DEMO mode blocks the Solana broadcast before the sender can run", async () => {
  const previousMode = process.env.BETX_MODE;
  const previousAuthorization = process.env.SOLANA_BROADCAST_ENABLED;
  let senderCalls = 0;
  try {
    process.env.BETX_MODE = "demo";
    process.env.SOLANA_BROADCAST_ENABLED = "true";
    assert.equal(isSolanaBroadcastAuthorized(), false);
    const result = await broadcast({ signature: ["test-only"] }, async () => {
      senderCalls++;
      return { result: true };
    });
    assert.equal(result.ok, false);
    assert.equal(senderCalls, 0);
  } finally {
    if (previousMode === undefined) delete process.env.BETX_MODE;
    else process.env.BETX_MODE = previousMode;
    if (previousAuthorization === undefined) delete process.env.SOLANA_BROADCAST_ENABLED;
    else process.env.SOLANA_BROADCAST_ENABLED = previousAuthorization;
  }
});

test("LIVE broadcast stays disabled without explicit server authorization", async () => {
  const previousMode = process.env.BETX_MODE;
  const previousAuthorization = process.env.SOLANA_BROADCAST_ENABLED;
  let senderCalls = 0;
  try {
    process.env.BETX_MODE = "live";
    delete process.env.SOLANA_BROADCAST_ENABLED;
    assert.equal(isSolanaBroadcastAuthorized(), false);
    const result = await broadcast({ signature: ["test-only"] }, async () => {
      senderCalls++;
      return { result: true };
    });
    assert.equal(result.ok, false);
    assert.equal(senderCalls, 0);
  } finally {
    if (previousMode === undefined) delete process.env.BETX_MODE;
    else process.env.BETX_MODE = previousMode;
    if (previousAuthorization === undefined) delete process.env.SOLANA_BROADCAST_ENABLED;
    else process.env.SOLANA_BROADCAST_ENABLED = previousAuthorization;
  }
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
