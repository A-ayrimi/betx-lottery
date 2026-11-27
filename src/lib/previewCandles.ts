import type { VaultCandle, VaultPayload, VaultTf } from "./vaultCandles";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const TARGET_BALANCE = 12_840;

const SHAPES = {
  round: { count: 36, step: HOUR * 6, start: 11_680, seed: 17 },
  "24h": { count: 24, step: HOUR, start: 12_240, seed: 29 },
  "30d": { count: 30, step: DAY, start: 9_450, seed: 41 },
} as const;

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function r2(value: number) {
  return Math.round(value * 100) / 100;
}

export function previewVaultCandles(tf: VaultTf, nowMs = Date.now()): VaultCandle[] {
  const shape: { count: number; step: number; start: number; seed: number } = SHAPES[tf];
  const rand = seeded(shape.seed);
  const nowBucket = Math.floor(nowMs / shape.step) * shape.step;
  const span = TARGET_BALANCE - shape.start;
  const swing = Math.max(6, span / shape.count);
  const out: VaultCandle[] = [];
  let previous = shape.start;

  for (let i = 0; i < shape.count; i++) {
    const t = nowBucket - (shape.count - 1 - i) * shape.step;
    const o = previous;
    const trend = (span * (i + 1)) / shape.count;
    const wave = (rand() - 0.47) * swing * 1.8;
    const c = i === shape.count - 1 ? TARGET_BALANCE : Math.max(o + 1, shape.start + trend + wave);
    const h = Math.max(o, c) + 2 + rand() * swing;
    const l = Math.min(o, c) - 2 - rand() * swing;
    const volume = Math.abs(c - o) + 4 + rand() * 10;
    const fees = Math.max(0, c - o) + rand() * 2;
    out.push({
      t,
      o: r2(o),
      h: r2(h),
      l: r2(l),
      c: r2(c),
      volume: r2(volume),
      fees: r2(fees),
      n: 1 + Math.floor(rand() * 4),
    });
    previous = c;
  }

  return out;
}

export function previewVaultPayload(tf: VaultTf, nowMs = Date.now()): VaultPayload {
  const candles = previewVaultCandles(tf, nowMs);
  const first = candles[0]?.o ?? TARGET_BALANCE;
  const change = r2(TARGET_BALANCE - first);
  return {
    ok: true,
    tf,
    candles,
    summary: {
      current: TARGET_BALANCE,
      change,
      changePct: first ? r2((change / first) * 100) : 0,
      high: Math.max(...candles.map((c) => c.h)),
      low: Math.min(...candles.map((c) => c.l)),
      volume: r2(candles.reduce((sum, c) => sum + c.volume, 0)),
      fees: r2(candles.reduce((sum, c) => sum + c.fees, 0)),
      count: candles.length,
      initialCapital: 20,
    },
    updatedAt: new Date(nowMs).toISOString(),
  };
}
