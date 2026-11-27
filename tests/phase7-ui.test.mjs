import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { en } from "../src/i18n/dictionaries/en.ts";
import { fa } from "../src/i18n/dictionaries/fa.ts";
import { es } from "../src/i18n/dictionaries/es.ts";
import { ar } from "../src/i18n/dictionaries/ar.ts";
import { tr } from "../src/i18n/dictionaries/tr.ts";
import { ru } from "../src/i18n/dictionaries/ru.ts";
import { WHEEL_SECTORS } from "../src/lib/wheel.ts";
import { WINNER_AMOUNTS_BY_CODE } from "../src/lib/tierMath.ts";

async function read(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

const locales = { en, fa, es, ar, tr, ru };
const wheelAmounts = WHEEL_SECTORS.map((sector) => sector.value);
const minWheelAmount = Math.min(...wheelAmounts);
const maxWheelAmount = Math.max(...wheelAmounts);
const minWheelLabel = minWheelAmount.toFixed(2);
const maxWheelLabel = maxWheelAmount.toFixed(2);

const amountTokenPattern =
  /(?<![\d.,])(?:\$\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*\$)(?!\d)/gu;

function parseAmountToken(token) {
  return Number(token.replace(/\s/g, "").replace("$", "").replace(",", "."));
}

function amountTokens(text) {
  return [...text.matchAll(amountTokenPattern)].map((match) => ({
    token: match[0],
    value: parseAmountToken(match[0]),
  }));
}

function wheelDescriptionStrings(dict) {
  return [
    ["wheel.body", dict.wheel.body],
    ["how.steps[1].d", dict.how.steps[1].d],
    ["faq.items[0].a", dict.faq.items[0].a],
    ["prizes.rows[1].amount", dict.prizes.rows[1].amount],
    ["prizes.rows[1].how", dict.prizes.rows[1].how],
    ["prizes.rows[1].when", dict.prizes.rows[1].when],
  ];
}

function assertWheelDescriptionRange(text, label) {
  const amounts = amountTokens(text);
  if (amounts.length === 0) return;

  if (amounts.length >= 2) {
    assert.ok(
      amounts.some((amount) => amount.value === minWheelAmount),
      `${label} does not include the configured minimum ${minWheelLabel}`,
    );
    assert.ok(
      amounts.some((amount) => amount.value === maxWheelAmount),
      `${label} does not include the configured maximum ${maxWheelLabel}`,
    );
  }
  assert.ok(
    amounts.every((amount) => amount.value >= minWheelAmount && amount.value <= maxWheelAmount),
    `${label} contains a wheel amount outside the configured limits`,
  );
}

function assertWheelAmountsWithinConfiguredRange(dict, label) {
  for (const [path, text] of wheelDescriptionStrings(dict)) {
    assertWheelDescriptionRange(text, `${label}.${path}`);
  }
}

test("all locales expose the tier copy", () => {
  const expected = Object.keys(en.tiers).sort();
  assert.deepEqual(Object.keys(fa.tiers).sort(), expected);
  assert.deepEqual(Object.keys(es.tiers).sort(), expected);
  assert.deepEqual(Object.keys(ar.tiers).sort(), expected);
  assert.deepEqual(Object.keys(tr.tiers).sort(), expected);
  assert.deepEqual(Object.keys(ru.tiers).sort(), expected);
  assert.equal(fa.tiers.title, "سطوح بلیط");
  assert.equal(en.tiers.current, "Current");
});

test("public buy flow carries the selected tier", async () => {
  const provider = await read("../src/components/AppProvider.tsx");
  const pool = await read("../src/components/PoolBand.tsx");
  assert.match(provider, /buy: \(count: number, tierCode\?: string\)/);
  assert.match(provider, /post\("\/api\/tickets\/buy", \{ count, tierCode \}\)/);
  assert.match(pool, /onClick=\{\(\) => setTierCode\(tier\.code\)\}/);
  assert.match(pool, /await buy\(count, activeTierCode\)/);
  assert.match(pool, /tiers\.map\(\(tier\) =>/);
});

test("tier-specific round state endpoint is public and sanitized", async () => {
  const route = await read("../src/app/api/rounds/state/route.ts");
  const store = await read("../src/lib/store.ts");
  assert.match(route, /limitByIp\("state", 120\)/);
  assert.match(route, /\/\^\[A-Za-z0-9_\]\{2,64\}\$\/\.test\(raw\)/);
  assert.match(route, /getState\(tierCode\)/);
  assert.match(store, /export async function getState\(tierSelector\?: string \| number\)/);
});

test("hero and pool show active-tier economics instead of global config", async () => {
  const pool = await read("../src/components/PoolBand.tsx");
  const hero = await read("../src/components/Hero.tsx");
  assert.match(pool, /selectedTier\.priceUsd/);
  assert.match(pool, /selectedTier\.prize/);
  assert.match(pool, /selectedTier\.treasury/);
  assert.match(pool, /selectedTier\.admin/);
  assert.match(hero, /state\?\.tiers\[0\]/);
  assert.match(hero, /tier \? `\$\$\{money\(tier\.prize(?:, locale)?\)\}`/);
});

test("all locales expose the shared homepage UI copy", () => {
  const expected = Object.keys(en.ui).sort();
  assert.deepEqual(Object.keys(fa.ui).sort(), expected);
  assert.deepEqual(Object.keys(es.ui).sort(), expected);
  assert.deepEqual(Object.keys(ar.ui).sort(), expected);
  assert.deepEqual(Object.keys(tr.ui).sort(), expected);
  assert.deepEqual(Object.keys(ru.ui).sort(), expected);
});

test("localized wheel copy matches the wheel sectors", () => {
  assert.ok(WHEEL_SECTORS.length > 0);
  assert.equal(minWheelLabel, "0.05");
  assert.equal(maxWheelLabel, "1.00");
  const expectedPrizeRowAmount = `$${minWheelLabel} – $${maxWheelLabel}`;
  const localizedPrizeRowAmounts = { fa: "$۰٫۰۵ – $۱٫۰۰" };

  for (const [label, dict] of Object.entries(locales)) {
    assert.equal(dict.prizes.rows[1].amount, localizedPrizeRowAmounts[label] ?? expectedPrizeRowAmount);
    assertWheelAmountsWithinConfiguredRange(dict, label);
  }
});

test("wheel-copy guard rejects stale Turkish prize variants", () => {
  const staleBodies = [
    "$0.10 ile $5.00",
    "0,10$ ile 5,00$",
    "$ 0,10 ile $ 5,00",
    "0,10 $ – 5,00 $",
  ];

  for (const body of staleBodies) {
    const stale = { ...tr, wheel: { ...tr.wheel, body } };
    assert.throws(
      () => assertWheelDescriptionRange(body, "tr.wheel.body"),
      /configured|wheel amount/,
    );
  }
});

test("homepage status banners and labels use localized copy", async () => {
  const banner = await read("../src/components/MaintenanceBanner.tsx");
  const page = await read("../src/app/[locale]/page.tsx");
  const hero = await read("../src/components/Hero.tsx");
  const header = await read("../src/components/Header.tsx");
  assert.match(banner, /message: string/);
  assert.doesNotMatch(banner, /BETX is in maintenance mode/);
  assert.match(page, /message=\{dict\.ui\.maintenanceBanner\}/);
  assert.match(hero, /d\.ui\.statusOnline/);
  assert.doesNotMatch(hero, />ONLINE</);
  assert.match(header, /aria-controls="mobile-nav"/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /dir=\{dir\}/);
});

test("all locales expose the phase 2 tier, transparency, jackpot, referral and wheel copy", () => {
  const expectedTiers = Object.keys(en.phase2.tiers).sort();
  const expectedTransparency = Object.keys(en.phase2.transparency).sort();
  const expectedJackpot = Object.keys(en.phase2.jackpot).sort();
  const expectedReferral = Object.keys(en.phase2.referral).sort();
  const expectedWheel = Object.keys(en.phase2.wheel).sort();

  for (const [label, dict] of Object.entries(locales)) {
    assert.equal(dict.nav.transparency.length > 0, true, `${label}.nav.transparency is empty`);
    assert.deepEqual(Object.keys(dict.phase2.tiers).sort(), expectedTiers);
    assert.deepEqual(Object.keys(dict.phase2.transparency).sort(), expectedTransparency);
    assert.deepEqual(Object.keys(dict.phase2.jackpot).sort(), expectedJackpot);
    assert.deepEqual(Object.keys(dict.phase2.referral).sort(), expectedReferral);
    assert.deepEqual(Object.keys(dict.phase2.wheel).sort(), expectedWheel);
    assert.match(dict.phase2.tiers.refund, /72|۷۲|٧٢/, `${label} must disclose the 72h refund window`);
    assert.match(dict.phase2.referral.body, /2|۲|٢/, `${label} must disclose the 2% referral rate`);
    assert.match(dict.phase2.jackpot.body, /50|۵۰|٥٠/, `${label} must disclose the 50/30/20 split`);
  }
});

test("seven tier winner tables match the published policy matrix", () => {
  assert.deepEqual(Object.keys(WINNER_AMOUNTS_BY_CODE).sort(), [
    "bronze_5",
    "diamond_100",
    "gold_25",
    "platinum_50",
    "silver_10",
    "starter_1",
    "vip_whale_200",
  ]);
  assert.deepEqual(WINNER_AMOUNTS_BY_CODE.starter_1, [30, 5, 2.5]);
  assert.deepEqual(WINNER_AMOUNTS_BY_CODE.vip_whale_200, [1300, 200, 100]);
});

test("phase 2 UI is wired to shared tier selection without financial side effects", async () => {
  const page = await read("../src/app/[locale]/page.tsx");
  const provider = await read("../src/components/AppProvider.tsx");
  const cards = await read("../src/components/TierCards.tsx");
  const transparency = await read("../src/components/TransparencyPanel.tsx");
  const jackpot = await read("../src/components/WeeklyJackpotWidget.tsx");
  const wallet = await read("../src/components/Wallet.tsx");
  const deposit = await read("../src/components/DepositCard.tsx");
  const invite = await read("../src/components/Sections.tsx");
  const wheel = await read("../src/components/Wheel.tsx");

  assert.match(page, /<TierCards \/>/);
  assert.match(page, /<TransparencyPanel \/>/);
  assert.match(page, /<WeeklyJackpotWidget \/>/);
  assert.match(provider, /selectedTierCode: string/);
  assert.match(cards, /setSelectedTierCode\((code|tier\.code)\)/);
  assert.match(cards, /maintenance \? c\.actionDisabled/);
  assert.doesNotMatch(cards, /buy\(/);
  assert.match(transparency, /seedHash/);
  assert.match(transparency, /<OnchainTreasury demo=\{demoEnabled\} compact \/>/);
  assert.match(jackpot, /weeklyJackpotSplit\(allocation\.jackpotCents\)/);
  assert.match(jackpot, /nextSundayUtc/);
  assert.match(wallet, /disabled=\{busy !== null \|\| dataUnavailable \|\| maintenance\}/);
  assert.match(deposit, /d\.wc\.comingSoonToast/);
  assert.match(deposit, /!paymentsReady \|\| maintenance/);
  assert.match(invite, /d\.phase2\.referral\.body/);
  assert.match(wheel, /d\.phase2\.wheel\.consolationBody/);
});

test("tier progress endpoint is public, sanitized and rate-limited", async () => {
  const route = await read("../src/app/api/tiers/progress/route.ts");
  assert.match(route, /limitByIp\("state", 120\)/);
  assert.match(route, /listActiveTiers\(\)/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.doesNotMatch(route, /buy|withdraw|deposit|automation/);
});
