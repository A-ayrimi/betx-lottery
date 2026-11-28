import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import bs58 from "bs58";
import { buildPostgresConfig } from "../src/lib/postgresConfig.ts";
import { isMaintenanceMode } from "../src/lib/gameConfig.ts";
import { DepositReservationError, isValidDepositIdempotencyKey, reserveDeposit } from "../src/lib/depositReservations.ts";
import {
  broadcast,
  broadcastSolanaSignedTransaction,
  isSolanaBroadcastAuthorized,
  isValidSolanaTxSignature,
} from "../src/lib/solana.ts";

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

test("payments, automatic sweep, and maintenance defaults remain fail-closed", () => {
  const config = readFileSync(new URL("../src/lib/config.ts", import.meta.url), "utf8");
  const gameConfig = readFileSync(new URL("../src/lib/gameConfig.ts", import.meta.url), "utf8");
  assert.match(config, /paymentsEnabled:\s*false/);
  assert.match(config, /get autoSweep\(\)\s*\{\s*return false;/);
  assert.match(config, /get maintenanceMode\(\)\s*\{\s*return isMaintenanceMode\(\);\s*\}/);
  assert.match(config, /BETX_MODE must be explicitly set to live or demo/);
  assert.match(gameConfig, /return raw !== "false";/);
  assert.match(gameConfig, /process\.env\.MAINTENANCE_MODE \?\? process\.env\.NEXT_PUBLIC_MAINTENANCE_MODE/);
  const reservations = readFileSync(new URL("../src/lib/depositReservations.ts", import.meta.url), "utf8");
  assert.match(reservations, /assertMutationsOpen\(\);/);
});

test("server maintenance mode overrides the public client fallback", () => {
  const previousServer = process.env.MAINTENANCE_MODE;
  const previousPublic = process.env.NEXT_PUBLIC_MAINTENANCE_MODE;
  try {
    process.env.MAINTENANCE_MODE = "false";
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE = "true";
    assert.equal(isMaintenanceMode(), false);

    process.env.MAINTENANCE_MODE = "true";
    process.env.NEXT_PUBLIC_MAINTENANCE_MODE = "false";
    assert.equal(isMaintenanceMode(), true);
  } finally {
    if (previousServer === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = previousServer;
    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_MAINTENANCE_MODE;
    else process.env.NEXT_PUBLIC_MAINTENANCE_MODE = previousPublic;
  }
});

test("reserveDeposit rejects internally while maintenance mode is on", async () => {
  const previous = process.env.MAINTENANCE_MODE;
  try {
    process.env.MAINTENANCE_MODE = "true";
    await assert.rejects(
      () =>
        reserveDeposit({}, {
          userId: 1,
          provider: "solana",
          amount: 10,
          orderId: "SOL-MAINTENANCE-TEST",
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
        }),
      /maintenance/,
    );
  } finally {
    if (previous === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = previous;
  }
});

test("deposit reservation keys are UUIDs and duplicate reservations have an explicit error", () => {
  assert.equal(isValidDepositIdempotencyKey("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidDepositIdempotencyKey("not-a-key"), false);
  assert.ok(new DepositReservationError("idempotency_conflict") instanceof Error);
});

test("Solana transaction signatures are base58, not hexadecimal", () => {
  const signature = bs58.encode(new Uint8Array(64).fill(7));
  assert.equal(isValidSolanaTxSignature(signature), true);
  assert.equal(isValidSolanaTxSignature("a".repeat(64)), false);
  assert.equal(isValidSolanaTxSignature("short"), false);
});

test("every financial broadcast path uses the emergency kill-switch wrapper", () => {
  const paths = [
    "../src/app/api/wallet/deposit/route.ts",
    "../src/app/api/admin/withdrawals/pay/route.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /await broadcast\(/, `${path} must call broadcast().`);
    assert.doesNotMatch(source, /broadcastSolanaSignedTransaction\(/, `${path} must not bypass broadcast().`);
  }
});

test("maintenance mode blocks payout, fee, deposit-status, and cron side effects", () => {
  const paths = [
    "../src/app/api/admin/withdrawals/pay/route.ts",
    "../src/app/api/admin/fees/route.ts",
    "../src/app/api/wallet/deposit/route.ts",
    "../src/app/api/cron/route.ts",
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /config\.maintenanceMode/, `${path} must honour maintenance mode.`);
  }
});
