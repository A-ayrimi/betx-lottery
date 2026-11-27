import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ar } from "../src/i18n/dictionaries/ar.ts";
import { en } from "../src/i18n/dictionaries/en.ts";
import { es } from "../src/i18n/dictionaries/es.ts";
import { fa } from "../src/i18n/dictionaries/fa.ts";
import { ru } from "../src/i18n/dictionaries/ru.ts";
import { tr } from "../src/i18n/dictionaries/tr.ts";
import {
  formatTicketSerial,
  isTicketSerial,
  isTicketSerialCollision,
} from "../src/lib/ticketSerial.ts";

async function read(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

const locales = { en, fa, es, ar, tr, ru };

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value[key], object);
}

test("ticket serials are structured, unambiguous, and deterministic", () => {
  const bytes = Uint8Array.from([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const serial = formatTicketSerial(42, bytes);
  const parts = serial.split("-");

  assert.equal(parts[0], "BTX");
  assert.equal(parts[1], "R42");
  assert.match(parts[2], /^[1-9A-HJ-NP-Za-km-z]{10,}$/);
  assert.match(parts[3], /^[1-9A-HJ-NP-Za-km-z]$/);
  assert.ok(!/[0OIl]/.test(parts[2] + parts[3]));
  assert.equal(isTicketSerial(serial), true);
  assert.equal(formatTicketSerial(42, bytes), serial);
  assert.notEqual(formatTicketSerial(42, Uint8Array.from([12, 11, 10, 9, 8, 7, 6, 5, 4])), serial);
  assert.equal(isTicketSerial("PX-001-000001"), false);
});

test("ticket collision detection is limited to serial unique violations", () => {
  assert.equal(isTicketSerialCollision({ code: "23505", constraint: "tickets_ticket_serial_unique" }), true);
  assert.equal(isTicketSerialCollision({ code: "23505", message: 'Key (ticket_serial)=(x) already exists.' }), true);
  assert.equal(isTicketSerialCollision({ cause: { code: "23505", constraint: "tickets_ticket_serial_unique" } }), true);
  assert.equal(isTicketSerialCollision({ code: "23505", constraint: "tickets_pkey" }), false);
  assert.equal(isTicketSerialCollision({ code: "23503" }), false);
});

test("purchase code retries serial collisions and persists ticket metadata", async () => {
  const store = await read("../src/lib/store.ts");
  assert.match(store, /makeTicketSerial\(round\.id\)/);
  assert.match(store, /serialRetryLimit = 5/);
  assert.match(store, /for \(let attempt = 1; attempt <= serialRetryLimit; attempt \+= 1\)/);
  assert.match(store, /isTicketSerialCollision\(error\)/);
  assert.match(store, /walletAddress: me\.walletAddress/);
  assert.match(store, /\btransactionSignature,/);
  assert.match(store, /status: "active"/);
});

test("database schema stores unique serials and verification metadata", async () => {
  const migration = await read("../supabase/migrations/20261127_m10_ticket_serial_metadata.sql");
  const constraints = await read("../supabase/migrations/20261127_m11_ticket_serial_constraints.sql");
  const schema = await read("../supabase/schema.sql");
  const drizzle = await read("../src/db/schema.ts");

  assert.match(migration, /RENAME COLUMN "serial" TO "ticket_serial"/);
  assert.match(migration, /RENAME CONSTRAINT "tickets_serial_unique" TO "tickets_ticket_serial_unique"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "wallet_address" text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "transaction_signature" text/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active'/);
  assert.match(constraints, /ALTER COLUMN "ticket_serial" SET NOT NULL/);
  assert.match(constraints, /ADD CONSTRAINT "tickets_ticket_serial_unique" UNIQUE \("ticket_serial"\)/);
  assert.match(schema, /"ticket_serial" text NOT NULL/);
  assert.match(schema, /CONSTRAINT "tickets_ticket_serial_unique" UNIQUE\("ticket_serial"\)/);
  for (const source of [schema, drizzle]) {
    assert.match(source, /ticket_serial/);
    assert.match(source, /wallet_address/);
    assert.match(source, /transaction_signature/);
  }
});

test("ticket lookup validates serials before hitting the database", async () => {
  const lookup = await read("../src/lib/ticketLookup.ts");
  const route = await read("../src/app/api/tickets/[serial]/route.ts");
  const page = await read("../src/app/[locale]/ticket/[serial]/page.tsx");

  assert.match(lookup, /if \(!isTicketSerial\(serial\)\) return null/);
  assert.match(lookup, /eq\(tickets\.ticketSerial, serial\)/);
  assert.match(lookup, /ROUND_STATUSES\.REFUNDED/);
  assert.match(route, /limitByIp\("ticket-lookup", 60\)/);
  assert.match(route, /params: Promise<\{ serial: string \}>/);
  assert.match(page, /getTicketBySerial\(decoded\)/);
  assert.match(page, /!isNonLivePreview\(\) && isTicketSerial\(decoded\)/);
  assert.match(page, /d\.ticket\.notFound/);
  assert.match(page, /dir=\{dirOf\(locale\)\}/);
});

test("ticket cards expose copy, inspect, QR, and purchase receipt", async () => {
  const details = await read("../src/components/TicketDetails.tsx");
  const wallet = await read("../src/components/Wallet.tsx");
  const pool = await read("../src/components/PoolBand.tsx");
  const toasts = await read("../src/components/Toasts.tsx");

  assert.match(details, /navigator\.clipboard\.writeText\(serial\)/);
  assert.match(details, /<QRCodeSVG/);
  assert.match(details, /TicketDetailModal/);
  assert.match(wallet, /TicketSerialRow/);
  assert.match(pool, /setInspectTicket\(\{/);
  assert.match(pool, /<TicketDetailModal ticket=\{inspectTicket\}/);
  assert.match(toasts, /PurchaseReceipt/);
});

test("number formatting localizes digits, separators, and percentages", async () => {
  const format = await read("../src/lib/format.ts");
  const client = await read("../src/i18n/client.tsx");
  const weekly = await read("../src/components/WeeklyJackpotWidget.tsx");

  assert.match(format, /fa: \["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"\]/);
  assert.match(format, /replace\(\/\[0-9\]\/g/);
  assert.match(format, /export function formatNumber/);
  assert.match(format, /export const formatPercent/);
  assert.match(format, /style: "percent"/);
  assert.match(client, /n: \(v\) => formatNumber\(v, locale\)/);
  assert.match(client, /format: \(v, options\) => formatNumber\(v, locale, options\)/);
  assert.match(weekly, /t\(c\.resetIn, \{ time: left \}\)/);
});

test("payout copy is tokenized against the selected tier", async () => {
  const hero = await read("../src/components/Hero.tsx");
  const pool = await read("../src/components/PoolBand.tsx");
  const sections = await read("../src/components/Sections.tsx");
  const payout = await read("../src/lib/payoutCopy.ts");
  const homePage = await read("../src/app/[locale]/page.tsx");

  assert.match(payout, /export function payoutVars/);
  assert.match(payout, /priceUsd: number \| string/);
  assert.match(hero, /t\(d\.hero\.body, payout\)/);
  assert.match(pool, /t\(d\.pool\.body, payout\)/);
  assert.match(pool, /t\(d\.pool\.yourChance, \{ n: n\(mine\), capacity: n\(capacity\), p: pct\(mine\) \}\)/);
  assert.match(sections, /t\(d\.prizes\.body, payout\)/);
  assert.match(sections, /t\(r\.amount, payout\)/);
  assert.match(sections, /t\(f\.a, payout\)/);
  assert.match(homePage, /d\.meta\.description[\s\S]*\{price\}[\s\S]*\{capacity\}/);
});

test("all locales expose tokenized ticket, verification, and payout copy", () => {
  const expectedKeys = Object.keys(en).sort();
  for (const [code, dict] of Object.entries(locales)) {
    assert.deepEqual(Object.keys(dict).sort(), expectedKeys, `${code} dictionary keys differ`);
    assert.ok(dict.ticket && dict.verification, `${code} is missing ticket/verification copy`);
    assert.match(getPath(dict, "meta.description"), /\{price\}/);
    assert.match(getPath(dict, "meta.description"), /\{capacity\}/);
    assert.match(getPath(dict, "hero.body"), /\{capacity\}/);
    assert.match(getPath(dict, "hero.body"), /\{prize\}/);
    assert.match(getPath(dict, "pool.money1"), /\{capacity\}/);
    assert.match(getPath(dict, "pool.money1"), /\{price\}/);
    assert.match(getPath(dict, "pool.money1"), /\{pool\}/);
    assert.match(getPath(dict, "pool.yourChance"), /\{n\}/);
    assert.match(getPath(dict, "pool.yourChance"), /\{capacity\}/);
    assert.match(getPath(dict, "prizes.body"), /\{winner\}/);
    assert.match(getPath(dict, "prizes.body"), /\{prizePct\}/);
    assert.match(getPath(dict, "prizes.body"), /\{treasuryPct\}/);
    assert.match(getPath(dict, "prizes.body"), /\{adminPct\}/);
    assert.match(getPath(dict, "faq.items.2.a"), /\{capacity\}/);
    assert.match(getPath(dict, "faq.items.2.a"), /\{winner\}/);
  }

  assert.match(fa.ticket.copy, /کپی/);
  assert.match(fa.verification.title, /راستی/);
});

test("verification page is localized and uses persisted serials", async () => {
  const page = await read("../src/app/[locale]/verify/[round]/page.tsx");
  assert.match(page, /getDictionary\(locale\)\.verification/);
  assert.match(page, /dir=\{dirOf\(locale\)\}/);
  assert.match(page, /t\.ticketSerial/);
  assert.match(page, /formatNumber\(Number\.isInteger\(id\) \? id : 0, locale\)/);
  assert.doesNotMatch(page, /dir="ltr" lang="en"/);
});
