import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const { deriveTierAmounts, tierLockKey } = await import("../src/lib/tierMath.ts");

test("tier allocation derives all four financial buckets", () => {
  assert.deepEqual(deriveTierAmounts({
    priceUsd: 1,
    capacity: 20,
    prizePercentage: 75,
    treasuryPercentage: 15,
    adminPercentage: 10,
  }), {
    totalPool: 20,
    prize: 15,
    treasury: 3,
    admin: 2,
    fee: 5,
  });

  assert.deepEqual(deriveTierAmounts({
    priceUsd: 5,
    capacity: 8,
    prizePercentage: 70,
    treasuryPercentage: 20,
    adminPercentage: 10,
  }), {
    totalPool: 40,
    prize: 28,
    treasury: 8,
    admin: 4,
    fee: 12,
  });
});

test("tier allocation rejects invalid configuration", () => {
  assert.throws(() => deriveTierAmounts({
    priceUsd: 1,
    capacity: 20,
    prizePercentage: 75,
    treasuryPercentage: 15,
    adminPercentage: 11,
  }), /sum to 100/);

  assert.throws(() => deriveTierAmounts({
    priceUsd: 0,
    capacity: 20,
    prizePercentage: 75,
    treasuryPercentage: 15,
    adminPercentage: 10,
  }), /must be positive/);

  assert.notEqual(tierLockKey(1), tierLockKey(2));
});

test("lottery engine uses tier-aware locks, pricing, and settlement records", async () => {
  const source = await readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
  const buyRoute = await readFile(new URL("../src/app/api/tickets/buy/route.ts", import.meta.url), "utf8");
  const automation = await readFile(new URL("../src/lib/automation.ts", import.meta.url), "utf8");

  assert.equal(source.includes("pg_advisory_xact_lock(424243)"), false);
  assert.match(source, /tierLockKey\(tier\.id\)/);
  assert.match(source, /export async function buyTickets\(userId: number, requested: number, tierSelector\?: string \| number\)/);
  assert.match(source, /const cost = roundMoney\(take \* tier\.priceUsd\)/);
  assert.match(source, /closesAt: new Date\(Date\.now\(\) \+ tier\.drawDurationMinutes \* 60_000\)/);
  assert.match(source, /insert\(drawCommitments\)/);
  assert.match(source, /insert\(roundSettlements\)/);
  assert.match(source, /insert\(treasuryTransactions\)/);
  assert.match(source, /autoDrawExpiredRounds/);
  assert.match(buyRoute, /buyTickets\(me\.id, Number\(body\.count\) \|\| 1, tierSelector\)/);
  assert.match(automation, /autoDrawExpiredRounds\(\)/);
});
