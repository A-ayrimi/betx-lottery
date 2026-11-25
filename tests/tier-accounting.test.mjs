import assert from "node:assert/strict";
import test from "node:test";

const { assessTreasuryCoverage, roundMoney, summarizeTierObligation, totalNetObligation } = await import(
  "../src/lib/tierAccounting.ts"
);

test("tier obligations reconcile against the configured pool", () => {
  const summary = summarizeTierObligation({
    totalPool: 20,
    prize: 15,
    treasury: 3,
    admin: 2,
    postedOut: 3,
    pendingOut: 1,
  });
  assert.deepEqual(summary, {
    grossObligation: 20,
    outflow: 3,
    reservedOut: 1,
    netObligation: 17,
    balanced: true,
  });

  const broken = summarizeTierObligation({
    totalPool: 20,
    prize: 15,
    treasury: 3,
    admin: 3,
    postedOut: 0,
    pendingOut: 0,
  });
  assert.equal(broken.balanced, false);
  assert.equal(totalNetObligation([summary, broken]), 38);
});

test("treasury coverage treats user balances, unmatched funds, and tier obligations as liabilities", () => {
  const covered = assessTreasuryCoverage({
    onchainUsdc: 100,
    userBalances: 60,
    unmatchedDeposits: 10,
    netObligations: 16,
  });
  assert.deepEqual(covered, { expectedLiabilities: 86, delta: 14, covered: true });

  const unavailable = assessTreasuryCoverage({
    onchainUsdc: null,
    userBalances: 60,
    unmatchedDeposits: 10,
    netObligations: 16,
  });
  assert.deepEqual(unavailable, { expectedLiabilities: 86, delta: null, covered: null });

  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(Number.NaN), 0);
});
