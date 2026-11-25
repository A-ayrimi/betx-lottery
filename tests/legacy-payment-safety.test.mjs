import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

function sourceFiles(dir = new URL("../src/", import.meta.url), acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) sourceFiles(url, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(url);
  }
  return acc;
}

test("legacy payment endpoints are 410 stubs with no financial path", () => {
  const routes = [
    ["src/app/api/payments/ipn/route.ts", "IPN"],
    ["src/app/api/payments/deposit/route.ts", "deposit"],
  ];
  for (const [file, label] of routes) {
    const source = read(file);
    assert.match(source, /status:\s*410/, `${label} must return 410`);
    assert.match(source, /legacy_payment_provider_disabled/, `${label} must use the safe error body`);
    assert.doesNotMatch(source, /creditDeposit|@\/db|deposits/, `${label} must not touch balances`);
    assert.doesNotMatch(
      source,
      /createInvoice|getPayment|verifyIpnSignature|applyNowPayment|nowpayments/,
      `${label} must not call NOWPayments`,
    );
  }
});

test("no runtime source imports NOWPayments modules", () => {
  const forbidden = [
    'from "@/lib/nowpayments"',
    'from "@/lib/nowpaymentsApply"',
    "from '../lib/nowpayments'",
    "from '../lib/nowpaymentsApply'",
  ];
  const ignored = new Set(["src/lib/nowpayments.ts", "src/lib/nowpaymentsApply.ts"]);

  for (const file of sourceFiles()) {
    const relative = file.pathname.split("/src/")[1];
    if (!relative || ignored.has(`src/${relative}`)) continue;
    const text = readFileSync(file, "utf8");
    for (const needle of forbidden) {
      assert.equal(text.includes(needle), false, `${relative} imports ${needle}`);
    }
  }
});

test("legacy invoice UI paths are removed and real payments stay fail-closed", () => {
  const checks = [
    ["src/components/AppProvider.tsx", "/api/payments/deposit"],
    ["src/components/DepositCard.tsx", "methodInvoice"],
    ["src/components/Wallet.tsx", "invoiceUrl"],
  ];
  for (const [relative, needle] of checks) {
    assert.equal(read(relative).includes(needle), false, `${relative} still contains ${needle}`);
  }

  const config = read("src/lib/config.ts");
  assert.match(config, /paymentsEnabled:\s*false/);
  assert.doesNotMatch(config, /paymentsEnabled:\s*config\.nowpayments\.enabled/);
});
