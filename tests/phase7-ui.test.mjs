import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { en } from "../src/i18n/dictionaries/en.ts";
import { fa } from "../src/i18n/dictionaries/fa.ts";
import { es } from "../src/i18n/dictionaries/es.ts";
import { ar } from "../src/i18n/dictionaries/ar.ts";
import { tr } from "../src/i18n/dictionaries/tr.ts";
import { ru } from "../src/i18n/dictionaries/ru.ts";

async function read(relative) {
  return readFile(new URL(relative, import.meta.url), "utf8");
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
  assert.match(hero, /tier \? `\$\$\{money\(tier\.prize\)\}`/);
});
