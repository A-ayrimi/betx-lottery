import assert from "node:assert/strict";
import test from "node:test";
import { assertDatabaseTarget } from "../src/lib/dbSafety.ts";
import { getRoundAccountingEntries, getTicketPurchaseCount } from "../src/lib/roundAccounting.ts";
import { getBetxMode } from "../src/lib/config.ts";

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

test("ticket capacity permits the twentieth ticket and rejects ticket twenty-one", () => {
  assert.equal(getTicketPurchaseCount(20, 19, 1), 1);
  assert.equal(getTicketPurchaseCount(20, 20, 1), 0);
  assert.equal(getTicketPurchaseCount(20, 19, 21), 1);
});

test("settlement allocation is exactly $20 = $15 + $3 + $2 and balances", () => {
  const entries = getRoundAccountingEntries({
    ticketRevenue: 20,
    prize: 15,
    treasury: 3,
    adminRevenue: 2,
  });
  assert.deepEqual(entries.map(({ amount }) => amount), [-20, 15, 3, 2]);
  assert.equal(entries.reduce((sum, entry) => sum + entry.amount, 0), 0);
  assert.throws(
    () => getRoundAccountingEntries({ ticketRevenue: 20, prize: 15, treasury: 5, adminRevenue: 2 }),
    /do not reconcile/,
  );
});
