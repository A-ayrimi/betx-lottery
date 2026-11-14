import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, vault, vaultSnapshots } from "@/db/schema";

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
  fees: number; // positive inflow in the bucket (round fees)
  n: number; // number of recorded events in the bucket
}

export interface VaultSummary {
  current: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
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

/** Idempotent: fills history for databases created before snapshots existed. */
export async function ensureVaultSnapshots(): Promise<void> {
  const [c] = await db.select({ c: sql<number>`count(*)::int` }).from(vaultSnapshots);
  if ((c?.c ?? 0) > 0) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424244)`);
    const [again] = await tx.select({ c: sql<number>`count(*)::int` }).from(vaultSnapshots);
    if ((again?.c ?? 0) > 0) return;

    const [v] = await tx.select().from(vault).limit(1);
    if (!v) return;
    const initial = Number(v.initialCapital);
    const drawn = await tx
      .select()
      .from(rounds)
      .where(eq(rounds.status, "drawn"))
      .orderBy(asc(rounds.drawnAt), asc(rounds.id));
    if (drawn.length === 0) {
      await tx.insert(vaultSnapshots).values({
        balance: String(Number(v.balance)),
        delta: "0",
        reason: "seed",
        createdAt: new Date(Date.now() - HOUR),
      });
      return;
    }
    const firstAt = drawn[0].drawnAt ? new Date(drawn[0].drawnAt).getTime() : Date.now();
    await tx.insert(vaultSnapshots).values({
      balance: String(initial),
      delta: "0",
      reason: "seed",
      createdAt: new Date(firstAt - HOUR),
    });

    // Each completed round credited its fee to the vault: rebuild that path.
    let running = initial;
    for (const r of drawn) {
      const fee = Number(r.fee);
      running += fee;
      await tx.insert(vaultSnapshots).values({
        balance: String(running),
        delta: String(fee),
        reason: "backfill",
        roundId: r.id,
        createdAt: r.drawnAt ? new Date(r.drawnAt) : new Date(),
      });
    }

    // Any untracked movement (spins, referral bonuses before this feature)
    // is reconciled so the last candle always equals the real vault balance.
    const current = Number(v.balance);
    if (Math.abs(running - current) > 0.009) {
      await tx.insert(vaultSnapshots).values({
        balance: String(current),
        delta: String(Math.round((current - running) * 100) / 100),
        reason: "backfill",
        createdAt: new Date(),
      });
    }
  });
}

/** Round-based candles: a candle closes at each completed draw. */
function byRound(rows: Row[]): VaultCandle[] {
  const out: VaultCandle[] = [];
  let cur: VaultCandle | null = null;
  for (const r of rows) {
    const before = r.balance - r.delta;
    if (!cur) {
      cur = { t: r.ts, o: before, h: Math.max(before, r.balance), l: Math.min(before, r.balance), c: r.balance, fees: 0, n: 0 };
    }
    cur.h = Math.max(cur.h, r.balance);
    cur.l = Math.min(cur.l, r.balance);
    cur.c = r.balance;
    cur.t = r.ts;
    cur.n += 1;
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
    let fees = 0;
    let n = 0;
    while (p < rows.length && rows[p].ts < be) {
      const r = rows[p++];
      h = Math.max(h, r.balance);
      l = Math.min(l, r.balance);
      c = r.balance;
      n += 1;
      if (r.delta > 0) fees += r.delta;
    }
    const o = last;
    if (n > 0) last = c;
    out.push({ t: bs, o, h, l, c, fees: Math.round(fees * 100) / 100, n });
  }
  return out;
}

export async function getVaultCandles(tf: VaultTf): Promise<VaultPayload> {
  await ensureVaultSnapshots();
  const [v] = await db.select().from(vault).limit(1);
  const raw = (
    await db
      .select()
      .from(vaultSnapshots)
      .orderBy(desc(vaultSnapshots.createdAt), desc(vaultSnapshots.id))
      .limit(MAX_ROWS)
  ).reverse();
  const rows: Row[] = raw.map((r) => ({
    ts: new Date(r.createdAt).getTime(),
    balance: Number(r.balance),
    delta: Number(r.delta),
    roundId: r.roundId ?? null,
  }));

  const now = Date.now();
  const initial = Number(v?.initialCapital ?? 20);
  const current = Number(v?.balance ?? initial);

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
    fees: Math.round(candles.reduce((a, c) => a + c.fees, 0) * 100) / 100,
    count: candles.length,
    initialCapital: initial,
  };

  return { ok: true, tf, candles, summary, updatedAt: new Date(now).toISOString() };
}
