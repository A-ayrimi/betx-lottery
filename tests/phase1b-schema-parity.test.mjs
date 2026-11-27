import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const schemaSql = await readFile(new URL("supabase/schema.sql", root), "utf8");
const drizzleSchema = await readFile(new URL("src/db/schema.ts", root), "utf8");
const moduleDir = new URL("supabase/migrations/", root);
const migrationNames = (await readdir(moduleDir)).filter((name) => name.endsWith(".sql")).sort();
const migrations = await Promise.all(
  migrationNames.map(async (name) => [name, await readFile(new URL(name, moduleDir), "utf8")]),
);
const stateRoute = await readFile(new URL("src/app/api/state/route.ts", root), "utf8");
const store = await readFile(new URL("src/lib/store.ts", root), "utf8");
const automation = await readFile(new URL("src/lib/automation.ts", root), "utf8");

const requiredTables = [
  "tier_policy_versions",
  "round_user_exposure",
  "draw_reveals",
  "round_winners",
  "referral_events",
  "weekly_jackpots",
  "site_revenue_entries",
  "refunds_and_rollovers",
  "kyc_reviews",
  "jurisdiction_checks",
  "admin_operators",
  "admin_sessions",
  "admin_permissions",
  "admin_audit_events",
  "integrity_proofs",
  "automation_jobs",
];

test("Phase 1B tables and columns are mirrored in Drizzle and SQL", () => {
  for (const table of requiredTables) {
    assert.match(schemaSql, new RegExp(`"${table}"`), `SQL missing ${table}`);
    assert.match(drizzleSchema, new RegExp(`"${table}"`), `Drizzle missing ${table}`);
  }
  for (const source of [schemaSql, drizzleSchema]) {
    assert.match(source, /tier_policy_version_id/);
    assert.match(source, /winner_amounts_usd|winnerAmountsUsd/);
    assert.match(source, /growth_balance|growthBalance/);
    assert.match(source, /reserve_balance|reserveBalance/);
    assert.match(source, /event_id/);
    assert.match(source, /operator_id/);
    assert.match(source, /blocked_jurisdictions|blockedJurisdictions/);
    assert.match(source, /consolation_rewards|consolationRewards/);
    assert.match(source, /weekly_jackpot_split|weeklyJackpotSplit/);
  }
});

test("M1-M9 migrations are forward-only and idempotent", () => {
  const m1toM9 = migrations.filter(([name]) => /20261126_m[1-9]_/.test(name));
  assert.equal(m1toM9.length, 9);
  for (const [name, sql] of m1toM9) {
    assert.match(sql, /BEGIN;/, `${name} must open a transaction`);
    assert.match(sql, /COMMIT;/, `${name} must close a transaction`);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/, `${name} must not drop tables`);
    assert.doesNotMatch(sql, /\bDROP COLUMN\b/, `${name} must not drop columns`);
  }
});

test("final Phase 1A parameters are encoded in schema and migrations", () => {
  for (const [name, sql] of migrations) {
    if (!/20261126_m[1-9]_/.test(name)) continue;
    if (name.includes("m1_")) {
      assert.match(sql, /POST_SETTLEMENT/);
      assert.match(sql, /SUNDAY_0000_UTC/);
      assert.match(sql, /\[50,30,20\]/);
      assert.match(sql, /probability_percent":45/);
      assert.match(sql, /probability_percent":3/);
      assert.match(sql, /US[\\"\\s,]*KP/);
    }
    if (name.includes("m2_")) {
      assert.match(sql, /kyc_status/);
      assert.match(sql, /lifetime_withdrawn_usd/);
    }
    if (name.includes("m6_")) assert.match(sql, /SAME_TIER_NEXT_ACTIVE|REFUND|ROLLOVER/);
    if (name.includes("m8_")) assert.doesNotMatch(sql, /'traffic'/);
    if (name.includes("m9_")) assert.match(sql, /SET DEFAULT 'solana'/);
  }
  assert.match(schemaSql, /'vip_whale_200'/);
  assert.match(schemaSql, /'SAME_TIER_NEXT_ACTIVE'/);
  assert.match(schemaSql, /'LIFETIME'/);
  assert.match(drizzleSchema, /MODULAR_PROVIDER/);
});

test("GET /api/state is pure read and public traffic cannot trigger automation", () => {
  assert.match(stateRoute, /export async function GET\(\)/);
  assert.doesNotMatch(stateRoute, /after\(|maybeRunAutomation|runAutomation|@\/lib\/automation/);
  assert.match(stateRoute, /getState\(\)/);
  assert.match(store, /findOpenRound/);
  const getStateStart = store.indexOf("export async function getState(");
  const getStateEnd = store.indexOf("/* ------------------------------------------------------------------ state */", getStateStart + 1);
  const getStateBody = store.slice(getStateStart, getStateEnd > getStateStart ? getStateEnd : undefined);
  assert.doesNotMatch(getStateBody, /ensureOpenRound|INSERT|UPDATE|DELETE/);
  assert.doesNotMatch(automation, /maybeRunAutomation|TRAFFIC_MIN_GAP_SECONDS|"traffic"/);
});

test("maintenance, payments and withdrawals remain hard-disabled by guards", async () => {
  assert.match(await readFile(new URL("src/app/api/admin/automation/route.ts", root), "utf8"), /isMaintenanceMode\(\)/);
  const withdraw = await readFile(new URL("src/app/api/payments/withdraw/route.ts", root), "utf8");
  const claim = await readFile(new URL("src/app/api/wallet/claim/route.ts", root), "utf8");
  const deposit = await readFile(new URL("src/app/api/wallet/deposit/route.ts", root), "utf8");
  const adminPay = await readFile(new URL("src/app/api/admin/withdrawals/pay/route.ts", root), "utf8");
  for (const source of [withdraw, claim, deposit, adminPay]) {
    assert.match(source, /config\.maintenanceMode/);
    assert.match(source, /publicConfig\(\)\.paymentsEnabled/);
  }
});
