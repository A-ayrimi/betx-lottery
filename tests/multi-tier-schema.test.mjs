import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/20261125_multi_tier_pool_foundation.sql", import.meta.url),
  "utf8",
);
const schemaSql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const drizzleSchema = await readFile(new URL("../src/db/schema.ts", import.meta.url), "utf8");

test("multi-tier migration is additive and idempotent", () => {
  assert.match(migrationSql, /BEGIN;/);
  assert.match(migrationSql, /COMMIT;/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "ticket_tiers"/);
  assert.match(migrationSql, /ON CONFLICT \("code"\) DO NOTHING/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS "tier_id"/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "draw_commitments"/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "round_settlements"/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "treasury_transactions"/);
  assert.match(
    migrationSql,
    /CHECK \("prize_percentage" \+ "treasury_percentage" \+ "admin_percentage" = 100\)/,
  );
  assert.match(migrationSql, /CHECK \(\s*"total_pool" = "winner_amount" \+ "treasury_amount" \+ "admin_amount"\s*\)/);
  assert.doesNotMatch(migrationSql, /\bDROP TABLE\b/);
  assert.doesNotMatch(migrationSql, /\bDROP COLUMN\b/);
});

test("baseline schema and Drizzle definitions expose the multi-tier foundation", () => {
  for (const source of [schemaSql, drizzleSchema]) {
    assert.match(source, /ticket_tiers/);
    assert.match(source, /draw_commitments/);
    assert.match(source, /round_settlements/);
    assert.match(source, /treasury_transactions/);
    assert.match(source, /tier_id/);
    assert.match(source, /tier_snapshot/);
  }
  assert.match(drizzleSchema, /export type TicketTier/);
  assert.match(drizzleSchema, /export type DrawCommitment/);
  assert.match(drizzleSchema, /export type RoundSettlement/);
  assert.match(drizzleSchema, /export type TreasuryTransaction/);
});
