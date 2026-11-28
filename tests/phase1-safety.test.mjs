import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertDatabaseTarget } from "../src/lib/dbSafety.ts";
import { getRoundAccountingEntries, getTicketPurchaseCount } from "../src/lib/roundAccounting.ts";
import { config, getBetxMode } from "../src/lib/config.ts";

async function read(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

test("unknown application mode fails closed", () => {
  const previous = process.env.BETX_MODE;
  delete process.env.BETX_MODE;
  assert.throws(() => getBetxMode(), /must be explicitly set/);
  if (previous === undefined) delete process.env.BETX_MODE;
  else process.env.BETX_MODE = previous;
});

test("demo and test modes reject remote database targets", () => {
  assert.throws(
    () => assertDatabaseTarget("demo", "postgres://user:pass@example.invalid/db"),
    /requires a local database/,
  );
  assert.throws(
    () => assertDatabaseTarget("live", "postgres://user:pass@example.invalid/db", "test"),
    /Tests require a local database/,
  );
  assert.doesNotThrow(() => assertDatabaseTarget("demo", "postgres://user:pass@127.0.0.1:54329/db"));
});

test("ticket capacity permits the fiftieth ticket and rejects ticket fifty-one", () => {
  assert.equal(getTicketPurchaseCount(50, 49, 1), 1);
  assert.equal(getTicketPurchaseCount(50, 50, 1), 0);
  assert.equal(getTicketPurchaseCount(50, 49, 51), 1);
});

test("settlement allocation is exactly $50 = $37.50 + $7.50 + $5 and balances", () => {
  const entries = getRoundAccountingEntries({
    ticketRevenue: 50,
    prize: 37.5,
    treasury: 7.5,
    adminRevenue: 5,
  });
  assert.deepEqual(entries.map(({ amount }) => amount), [-50, 37.5, 7.5, 5]);
  assert.equal(entries.reduce((sum, entry) => sum + entry.amount, 0), 0);
  assert.throws(
    () => getRoundAccountingEntries({ ticketRevenue: 50, prize: 37.5, treasury: 5, adminRevenue: 5 }),
    /do not reconcile/,
  );
});

test("production app url fails closed instead of using localhost", () => {
  const previousUrl = process.env.APP_URL;
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    delete process.env.APP_URL;
    assert.throws(() => config.appUrl, /APP_URL must be explicitly configured/);
    process.env.APP_URL = "http://localhost:3000";
    assert.throws(() => config.appUrl, /must not point to localhost/);
    process.env.APP_URL = "https://betx.example";
    assert.equal(config.appUrl, "https://betx.example");
  } finally {
    if (previousUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousUrl;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test("mutation libraries use the centralized maintenance guard", async () => {
  const guard = await read("../src/lib/mutationGuard.ts");
  assert.match(guard, /export function assertMutationsOpen\(\)/);
  assert.match(guard, /if \(isMaintenanceMode\(\)\) throw new MaintenanceError\(\);/);

  for (const path of [
    "../src/lib/store.ts",
    "../src/lib/tierAdmin.ts",
    "../src/lib/depositReservations.ts",
  ]) {
    const source = await read(path);
    assert.match(source, /assertMutationsOpen/);
    assert.doesNotMatch(source, /function assertMutationsOpen\(\)/);
  }

  const store = await read("../src/lib/store.ts");
  const tierAdmin = await read("../src/lib/tierAdmin.ts");
  for (const name of [
    "refundRound",
    "rewardSignupReferral",
    "spinWheel",
    "approveRoundResult",
    "settleApprovedRound",
    "buyTickets",
    "creditDeposit",
    "requestWithdrawal",
    "processWithdrawal",
    "setDepositLimit",
    "selfExclude",
    "initializeAdminVault",
    "ensureOpenRound",
    "recordVaultSnapshot",
    "setSession",
  ]) {
    assert.match(store, new RegExp(`export async function ${name}\\([\\s\\S]{0,220}?assertMutationsOpen\\(\\)`));
  }
  for (const name of ["createTier", "updateTier", "setTierStatus"]) {
    assert.match(tierAdmin, new RegExp(`export async function ${name}\\([\\s\\S]{0,220}?assertMutationsOpen\\(\\)`));
  }
});

test("unprotected signup and admin routes reject maintenance requests", async () => {
  for (const path of [
    "../src/app/api/auth/connect/route.ts",
    "../src/app/api/wallet/verify/route.ts",
    "../src/app/api/auth/telegram/route.ts",
    "../src/app/api/telegram/webhook/route.ts",
    "../src/app/api/admin/tiers/route.ts",
    "../src/app/api/admin/tiers/[id]/route.ts",
  ]) {
    const route = await read(path);
    assert.ok(
      /maintenanceBlocked\(\)/.test(route) || /handleError\(error\)/.test(route),
      `${path} must surface maintenance blocks`,
    );
  }
});

test("every real mutating API route surfaces maintenance blocks", async () => {
  const routes = [
    "../src/app/api/wheel/spin/route.ts",
    "../src/app/api/telegram/webhook/route.ts",
    "../src/app/api/auth/telegram/route.ts",
    "../src/app/api/tickets/buy/route.ts",
    "../src/app/api/auth/logout/route.ts",
    "../src/app/api/auth/connect/route.ts",
    "../src/app/api/payments/withdraw/route.ts",
    "../src/app/api/account/route.ts",
    "../src/app/api/payments/ipn/route.ts",
    "../src/app/api/wallet/deposit/route.ts",
    "../src/app/api/wallet/verify/route.ts",
    "../src/app/api/payments/deposit/route.ts",
    "../src/app/api/wallet/claim/route.ts",
    "../src/app/api/wallet/nonce/route.ts",
    "../src/app/api/admin/automation/route.ts",
    "../src/app/api/admin/fees/route.ts",
    "../src/app/api/admin/withdrawals/route.ts",
    "../src/app/api/admin/withdrawals/pay/route.ts",
    "../src/app/api/admin/treasury/initialize/route.ts",
    "../src/app/api/admin/tiers/route.ts",
    "../src/app/api/admin/rounds/open/route.ts",
    "../src/app/api/admin/tiers/[id]/route.ts",
    "../src/app/api/admin/rounds/[id]/review/route.ts",
    "../src/app/api/admin/rounds/[id]/settle/route.ts",
    "../src/app/api/auth/telegram-link/route.ts",
    "../src/app/api/telegram/setup/route.ts",
  ];
  for (const path of routes) {
    const route = await read(path);
    const inertStub = /legacy_payment_provider_disabled/.test(route);
    const guarded =
      /maintenanceBlocked\(\)/.test(route) ||
      /config\.maintenanceMode/.test(route) ||
      /isMaintenanceMode\(\)/.test(route) ||
      /handleError\(error\)/.test(route) ||
      /handleError\(e\)/.test(route);
    assert.ok(guarded || inertStub, `${path} must surface maintenance blocks`);
  }
});

test("cron reports maintenance as a service-unavailable response", async () => {
  const cron = await read("../src/app/api/cron/route.ts");
  assert.match(cron, /status: "MAINTENANCE"/);
  assert.match(cron, /\{ status: 503 \}/);
  assert.doesNotMatch(cron, /skipped: "maintenance"/);
});
