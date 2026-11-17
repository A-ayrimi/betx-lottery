import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledger } from "@/db/schema";

/**
 * Candle series for the vault balance, built ONLY from recorded snapshots
 * (every committed change of the vault). Nothing here is simulated.
 *
 *  round : one candle per completed draw (includes spins/referrals between draws)
 *  24h   : hourly candles over the last 24 hours (gaps carried forward, flat)
 *  30d   : daily candles over the last 30 days (gaps carried forward, flat)
 */

export const VAULT_TF = ["round", "24h", "30d"] as const;
export type VaultTf = (typeof VAULT_TF)[number];

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MAX_ROWS = 6000;
const MAX_ROUND_CANDLES = 60;

export interface VaultCandle {
  t: number; // bucket start (epoch ms)
  o: number;
  h: number;
  l: number;
  c: number;
  volume: number;
  fees: number; // positive inflow in the bucket (round fees)
  n: number; // number of recorded events in the bucket
}

export interface VaultSummary {
  current: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  fees: number;
  count: number;
  initialCapital: number;
}

export interface VaultPayload {
  ok: true;
  tf: VaultTf;
  candles: VaultCandle[];
  summary: VaultSummary;
  updatedAt: string;
}

interface Row {
  ts: number;
  balance: number;
  delta: number;
  roundId: number | null;
}

/** Round-based candles: a candle closes at each completed draw. */
function byRound(rows: Row[]): VaultCandle[] {
  const out: VaultCandle[] = [];
  let cur: VaultCandle | null = null;
  for (const r of rows) {
    const before = r.balance - r.delta;
    if (!cur) {
      cur = { t: r.ts, o: before, h: Math.max(before, r.balance), l: Math.min(before, r.balance), c: r.balance, volume: 0, fees: 0, n: 0 };
    }
    cur.h = Math.max(cur.h, r.balance);
    cur.l = Math.min(cur.l, r.balance);
    cur.c = r.balance;
    cur.t = r.ts;
    cur.n += 1;
    cur.volume += Math.abs(r.delta);
    if (r.delta > 0) cur.fees += r.delta;
    if (r.roundId !== null) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur); // the round still in progress
  return out;
}

/** Time-bucketed candles with carry-forward for empty buckets. */
function byTime(rows: Row[], size: number, span: number, now: number, initial: number): VaultCandle[] {
  const startBucket = Math.floor((now - span) / size);
  const endBucket = Math.floor(now / size);
  let last = initial;
  let p = 0;
  while (p < rows.length && rows[p].ts < startBucket * size) {
    last = rows[p].balance;
    p++;
  }
  const out: VaultCandle[] = [];
  for (let b = startBucket; b <= endBucket; b++) {
    const bs = b * size;
    const be = bs + size;
    let h = last;
    let l = last;
    let c = last;
    let volume = 0;
    let fees = 0;
    let n = 0;
    while (p < rows.length && rows[p].ts < be) {
      const r = rows[p++];
      h = Math.max(h, r.balance);
      l = Math.min(l, r.balance);
      c = r.balance;
      n += 1;
      volume += Math.abs(r.delta);
      if (r.delta > 0) fees += r.delta;
    }
    const o = last;
    if (n > 0) last = c;
    out.push({ t: bs, o, h, l, c, volume: Math.round(volume * 100) / 100, fees: Math.round(fees * 100) / 100, n });
  }
  return out;
}

export async function getVaultCandles(tf: VaultTf): Promise<VaultPayload> {
  const balanceRows = await db
    .select({
      amount: ledger.amount,
      createdAt: ledger.createdAt,
      roundId: ledger.roundId,
      id: ledger.id,
      type: ledger.type,
    })
    .from(ledger)
    .where(and(
      eq(ledger.account, "vault_balance"),
      isNotNull(ledger.reference),
      isNotNull(ledger.transactionKey),
    ))
    .orderBy(desc(ledger.createdAt), desc(ledger.id))
    .limit(MAX_ROWS);
  const raw = balanceRows.reverse();
  const [totals] = await db
    .select({
      current: sql<string>`coalesce(sum(${ledger.amount}), 0)`,
      initialCapital: sql<string>`coalesce(sum(case when ${ledger.type} = 'vault_seed' then ${ledger.amount} else 0 end), 0)`,
    })
    .from(ledger)
    .where(and(
      eq(ledger.account, "vault_balance"),
      isNotNull(ledger.reference),
      isNotNull(ledger.transactionKey),
    ));
  const current = Number(totals?.current ?? 0);
  const initial = Number(totals?.initialCapital ?? 0);
  const omittedBalance = current - raw.reduce((sum, row) => sum + Number(row.amount), 0);
  let running = omittedBalance;
  const rows: Row[] = raw.map((entry) => {
    const delta = Number(entry.amount);
    running += delta;
    return {
      ts: new Date(entry.createdAt).getTime(),
      balance: running,
      delta,
      roundId: entry.type === "vault_treasury_contribution" ? entry.roundId ?? null : null,
    };
  });

  const now = Date.now();

  if (rows.length === 0) {
    return {
      ok: true,
      tf,
      candles: [],
      summary: { current: 0, change: 0, changePct: 0, high: 0, low: 0, volume: 0, fees: 0, count: 0, initialCapital: 0 },
      updatedAt: new Date(now).toISOString(),
    };
  }

  let candles: VaultCandle[];
  if (tf === "round") {
    candles = byRound(rows).slice(-MAX_ROUND_CANDLES);
  } else if (tf === "24h") {
    candles = byTime(rows, HOUR, 24 * HOUR, now, initial);
  } else {
    candles = byTime(rows, DAY, 30 * DAY, now, initial);
  }

  const first = candles[0]?.o ?? current;
  const change = Math.round((current - first) * 100) / 100;
  const summary: VaultSummary = {
    current,
    change,
    changePct: first ? Math.round((change / first) * 10000) / 100 : 0,
    high: candles.length ? Math.max(...candles.map((c) => c.h)) : current,
    low: candles.length ? Math.min(...candles.map((c) => c.l)) : current,
    volume: Math.round(candles.reduce((a, c) => a + c.volume, 0) * 100) / 100,
    fees: Math.round(candles.reduce((a, c) => a + c.fees, 0) * 100) / 100,
    count: candles.length,
    initialCapital: initial,
  };

  return { ok: true, tf, candles, summary, updatedAt: new Date(now).toISOString() };
}
