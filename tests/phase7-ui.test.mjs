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

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const persianAmount = (value) =>
  value.toFixed(2).replace(/[0-9]/g, (digit) => persianDigits[Number(digit)]).replace(".", "٫");

const amountTokenPattern =
  /(?<![\d.,٫٬۰-۹])(?:\$\s*[\d۰-۹]+(?:[.,٫][\d۰-۹]+)?|[\d۰-۹]+(?:[.,٫][\d۰-۹]+)?\s*\$|[\d۰-۹]+(?:[.,٫][\d۰-۹]+)?\s*دلار)(?![\d۰-۹])/gu;

function parseAmountToken(token) {
  const normalized = token
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٫,]/g, ".")
    .replace(/[\s$دلار]/g, "");
  return Number(normalized);
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
  assert.match(pool, /activeTierCode = selectedTierCode \|\| defaultRound/);
  assert.match(pool, /await buy\(count, activeTierCode\)/);
  const tiers = await read("../src/components/TierCards.tsx");
  assert.match(tiers, /setSelectedTierCode\(code\)/);
  assert.match(tiers, /tiers\.map\(\(tier\) =>/);
});

test("tier-specific round state endpoint is public and sanitized", async () => {
  const route = await read("../src/app/api/rounds/state/route.ts");
  const store = await read("../src/lib/store.ts");
  assert.match(route, /limitByIp\("state", 120\)/);
  assert.match(route, /\/\^\[A-Za-z0-9_\]\{2,64\}\$\/\.test\(raw\)/);
  assert.match(route, /getState\(tierCode\)/);
  assert.match(store, /export async function getState\(tierSelector\?: string \| number\)/);
  assert.match(store, /resolveTierConfig\(db, tierSelector, true\)/);
});

test("hero and pool show active-tier economics instead of global config", async () => {
  const pool = await read("../src/components/PoolBand.tsx");
  const hero = await read("../src/components/Hero.tsx");
  assert.match(pool, /selectedTier\?\.priceUsd/);
  assert.match(pool, /selectedTier\?\.prize/);
  assert.match(pool, /selectedTier\.treasury/);
  assert.match(pool, /selectedTier\.admin/);
  assert.match(hero, /state\?\.tiers\[0\]/);
  assert.match(hero, /tier \? `.*usd\(tier\.prize, locale\)/);
});

test("all locales expose the shared homepage UI copy", async () => {
  const expected = Object.keys(en.ui).sort();
  assert.deepEqual(Object.keys(fa.ui).sort(), expected);
  assert.deepEqual(Object.keys(es.ui).sort(), expected);
  assert.deepEqual(Object.keys(ar.ui).sort(), expected);
  assert.deepEqual(Object.keys(tr.ui).sort(), expected);
  assert.deepEqual(Object.keys(ru.ui).sort(), expected);
  for (const [label, dict] of Object.entries(locales)) {
    const isFa = label === "fa";
    assert.equal(dict.ui.balanceOnchain, isFa ? "روی بلاکچین" : "ON-CHAIN");
    assert.equal(dict.ui.balanceLedger, isFa ? "دفترکل داخلی" : "INTERNAL LEDGER");
    assert.equal(
      dict.ui.balanceDemo.replace(/\u200c/g, ""),
      isFa ? "شبیهسازی/دمو" : "SIMULATED/DEMO",
    );
  }
  const balanceStatus = await read("../src/lib/balanceStatus.ts");
  assert.match(balanceStatus, /ONCHAIN: "ON-CHAIN"/);
  assert.match(balanceStatus, /LEDGER: "INTERNAL LEDGER"/);
  assert.match(balanceStatus, /DEMO: "SIMULATED\/DEMO"/);
  const badge = await read("../src/components/BalanceBadge.tsx");
  assert.match(badge, /data-balance-source=\{SOURCE_BY_KIND\[kind\]\}/);
  assert.match(badge, /aria-label=\{`\$\{ARIA_PREFIX\[locale\]\}: \$\{label\}`\}/);
});

test("localized wheel copy matches the wheel sectors", () => {
  assert.ok(WHEEL_SECTORS.length > 0);
  assert.equal(minWheelLabel, "0.05");
  assert.equal(maxWheelLabel, "1.00");
  const expectedPrizeRowAmount = `$${minWheelLabel} – $${maxWheelLabel}`;
  const faPrizeRowAmount = `${persianAmount(minWheelAmount)} دلار – ${persianAmount(maxWheelAmount)} دلار`;

  for (const [label, dict] of Object.entries(locales)) {
    assert.equal(dict.prizes.rows[1].amount, label === "fa" ? faPrizeRowAmount : expectedPrizeRowAmount);
    assertWheelAmountsWithinConfiguredRange(dict, label);
  }
});

test("wheel cards render every configured prize value", async () => {
  const wheel = await read("../src/components/Wheel.tsx");
  assert.match(wheel, /new Set\(sectors\.map\(\(s\) => s\.value\)\)/);
  assert.match(wheel, /sort\(\(a, b\) => a - b\)/);
  assert.match(wheel, /lg:grid-cols-5/);
  for (const [label, dict] of Object.entries(locales)) {
    for (const key of ["tierBase", "tierSilver", "tierGold", "tierPremium", "tierJackpot"]) {
      assert.ok(dict.wheel[key], `${label}.wheel.${key} is missing`);
    }
  }
});

test("single-winner split copy keeps approval without duplicating a 20-ticket footnote", () => {
  for (const [label, dict] of Object.entries({ en, fa })) {
    assert.match(dict.pool.money3, /approv|review|تأیید|بررسی/, `${label}.pool.money3 must mention approval`);
    assert.match(dict.prizes.rows[4].amount, /\$37\.50|۳۷٫۵۰/, `${label}.prizes.rows[4] must state the single-winner split`);
    assert.match(dict.faq.items[1].a, /admin|Manager|سیستمی BETX/, `${label}.faq.items[1].a must mention approval`);
    assert.match(dict.board.autoDrawNote, /admin|Manager|سیستمی BETX/, `${label}.board.autoDrawNote must mention approval`);
  }
});

test("Persian copy uses BETX wording and localized dollar amounts", () => {
  const copy = JSON.stringify(fa);
  assert.doesNotMatch(copy, /Manager|مدیر/);
  assert.doesNotMatch(copy, /\$/);
  assert.doesNotMatch(copy, /[0-9] دلار/);
  assert.match(copy, /[۰-۹][٫۰-۹]* دلار/);
  assert.doesNotMatch(copy, /مند\s*سطح/);
  assert.doesNotMatch(copy, /MULTI-TICKET BOOST/);
  assert.doesNotMatch(copy, /واریز و برداشت در حالت تعمیرات/);
  assert.doesNotMatch(copy, /دور پایه ۲۰ بلیطی/);
  assert.doesNotMatch(copy, /استخرشان بدون برنده/);
  assert.match(copy, /خرید چندتایی · شانس بیشتر/);
  assert.equal(fa.pool.boostLabel, "{n} بلیط · {amount}");
  assert.match(fa.footer.license, /زنجیره\u200cای/);
  assert.equal(fa.phase2.tiers.kicker, "هفت سطح شفاف");
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

test("settlement copy no longer claims automated BETX verification", () => {
  assert.doesNotMatch(JSON.stringify(en), /automated BETX verification|BETX platform fee/i);
  assert.doesNotMatch(JSON.stringify(fa), /خودکار سیستم BETX|کارمزد پلتفرم BETX/);
});

test("draw proof copy describes commit-reveal HMAC without external randomness claims", () => {
  for (const [label, dict] of Object.entries(locales)) {
    assert.match(dict.pool.transparencyLive, /SHA-256/, `${label}.pool.transparencyLive must name SHA-256`);
    assert.match(dict.pool.transparencyLive, /HMAC-SHA256/, `${label}.pool.transparencyLive must name HMAC-SHA256`);
    assert.match(dict.faq.items[3].a, /SHA-256/, `${label}.faq.items[3].a must name SHA-256`);
    assert.match(dict.faq.items[3].a, /HMAC-SHA256/, `${label}.faq.items[3].a must name HMAC-SHA256`);
  }
  assert.doesNotMatch(JSON.stringify(en), /Provably fair/);
  assert.doesNotMatch(JSON.stringify(en), /external randomness is used/i);
});

test("live status and wallet copy distinguish ledger mode from enabled payments", async () => {
  for (const [label, dict] of Object.entries(locales)) {
    assert.ok(dict.ui.statusLedger, `${label}.ui.statusLedger is missing`);
    assert.ok(dict.wallet.bodyPaymentsPaused, `${label}.wallet.bodyPaymentsPaused is missing`);
    assert.ok(dict.wc.paymentsPausedBadge, `${label}.wc.paymentsPausedBadge is missing`);
    assert.ok(dict.board.historyPending, `${label}.board.historyPending is missing`);
    assert.match(dict.phase2.jackpot.note, /80|۸۰|٨٠/, `${label} jackpot note must name the 80 portion`);
  }

  const hero = await read("../src/components/Hero.tsx");
  const wallet = await read("../src/components/Wallet.tsx");
  const deposit = await read("../src/components/DepositCard.tsx");
  const winners = await read("../src/components/WinnersHistory.tsx");
  const jackpot = await read("../src/components/WeeklyJackpotWidget.tsx");
  assert.match(hero, /d\.ui\.statusLedger/);
  assert.match(wallet, /d\.wallet\.bodyPaymentsPaused/);
  assert.match(wallet, /d\.wc\.paymentsPausedBadge/);
  assert.match(deposit, /cfg\?\.paymentsEnabled === false/);
  assert.match(winners, /d\.board\.historyPending/);
  assert.match(jackpot, /aria-describedby="jackpot-estimate-note"/);
});

test("og image is generated instead of referencing a missing asset", async () => {
  const route = await read("../src/app/og.png/route.tsx");
  assert.match(route, /ImageResponse/);
  assert.match(route, /width: 1200, height: 630/);
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
    assert.match(dict.phase2.jackpot.body, /100|۱۰۰/, `${label} must disclose the single-winner 100% pot`);
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
  assert.deepEqual(WINNER_AMOUNTS_BY_CODE.starter_1, [37.5]);
  assert.deepEqual(WINNER_AMOUNTS_BY_CODE.vip_whale_200, [1600]);
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
  assert.match(transparency, /<OnchainTreasury demo=\{isPreview \|\| demoEnabled\} compact \/>/);
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

test("pool page polish uses localized labels and ignores extension-only errors", async () => {
  const layout = await read("../src/app/layout.tsx");
  const hero = await read("../src/components/Hero.tsx");
  const pool = await read("../src/components/PoolBand.tsx");
  const deposit = await read("../src/components/DepositCard.tsx");
  const wallet = await read("../src/components/Wallet.tsx");
  const sections = await read("../src/components/Sections.tsx");

  const extensionFilter = await read("../public/dev-error-filter.js");
  assert.match(layout, /dev-error-filter\.js/);
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(extensionFilter, /chrome-extension:\/\//);
  assert.match(hero, /\$\{n\(1\)\}\/\$\{n\(/);
  assert.doesNotMatch(hero, /1\/\$\{n\(/);
  assert.match(pool, /d\.pool\.boostLabel/);
  assert.doesNotMatch(pool, /\[d\.tiers\.price/);
  assert.match(deposit, /locale === "fa" \? usd\(a, locale\)/);
  assert.match(wallet, /placeholder=\{locale === "fa" \? usd\(15, locale\) : "15\.00"\}/);
  assert.match(sections, /formatPadded\(year, locale, 4\)/);
  assert.match(sections, /locale === "fa" \? d\.footer\.license : cfg\.license/);
});

test("public copy uses single-winner economics without legacy tier-one examples", () => {
  for (const [label, dict] of Object.entries(locales)) {
    const copy = JSON.stringify(dict);
    assert.doesNotMatch(copy, /Tier 1 example/i, `${label} must not describe a legacy Tier 1 example`);
    assert.doesNotMatch(copy, /50 tickets × \$1/, `${label} must not hardcode 50 × $1`);
  }
});

test("draw duration is localized instead of showing raw minutes", async () => {
  const format = await read("../src/lib/format.ts");
  const pool = await read("../src/components/PoolBand.tsx");
  assert.match(format, /export function formatDurationMinutes/);
  assert.match(format, /fa: \{ day: "روز", hour: "ساعت", minute: "دقیقه" \}/);
  assert.match(format, /value % 1440 === 0/);
  assert.match(pool, /formatDurationMinutes\(selectedTier\.drawDurationMinutes \?\? 0, locale\)/);
  assert.doesNotMatch(pool, /d\.tiers\.minutes, \{ n: n\(/);
});

test("maintenance preview shows a disabled empty pool with accessible controls", async () => {
  const pool = await read("../src/components/PoolBand.tsx");
  assert.match(pool, /const paused = maintenance \|\| isPreview/);
  assert.match(pool, /<motion\.button/);
  assert.doesNotMatch(pool, /role="button"/);
  assert.match(pool, /role="progressbar"/);
  assert.match(pool, /aria-valuenow=\{sold\}/);
  assert.match(pool, /disabled=\{disabled\}/);
  assert.match(pool, /paused \? d\.ui\.statusMaintenance/);
});

test("homepage hierarchy follows the pool narrative before secondary modules", async () => {
  const page = await read("../src/app/[locale]/page.tsx");
  const order = [
    "<Hero />",
    "<PoolBand />",
    "<TierCards />",
    "<Prizes />",
    "<TransparencyPanel />",
    "<WeeklyJackpotWidget />",
    "<WinnersHistory />",
    "<Faq />",
    "<Wheel />",
    "<Invite />",
    "<Wallet />",
  ];
  const positions = order.map((component) => {
    const index = page.indexOf(component);
    assert.ok(index >= 0, `${component} must be rendered on the homepage`);
    return index;
  });
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("form controls expose busy and pressed state", async () => {
  const deposit = await read("../src/components/DepositCard.tsx");
  const wallet = await read("../src/components/Wallet.tsx");
  const header = await read("../src/components/Header.tsx");
  assert.match(deposit, /aria-pressed=\{!custom && amount === a\}/);
  assert.match(deposit, /aria-busy=\{phase !== "" && phase !== "done"\}/);
  assert.match(wallet, /aria-busy=\{busy === "wd"\}/);
  assert.match(header, /aria-busy=\{busy\}/);
});
