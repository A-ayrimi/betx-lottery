import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  deposits,
  feeTransfers,
  vaultSnapshots,
  ledger,
  rounds,
  tickets,
  users,
  vault,
  wheelSpins,
  withdrawals,
  type User,
} from "@/db/schema";
import { config, publicConfig } from "@/lib/config";
import { WHEEL_SECTORS } from "@/lib/wheel";
import type { Dict } from "@/i18n/dictionaries/en";
import { regionStatus } from "@/lib/geo";
import { headers } from "next/headers";
import { isTronAddress, tron } from "@/lib/tron";

export { money } from "@/lib/format";

export const SESSION_COOKIE = "betx_session";
export const TICKET_PRICE = 1;
export const POOL_CAPACITY = 20;
export const PRIZE = 15;
export const FEE = 5;
export const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = Tx | typeof db;

export type ErrorCode = keyof Dict["errors"];

export class UserError extends Error {
  status: number;
  code: ErrorCode;
  vars?: Record<string, string | number>;
  constructor(code: ErrorCode, status = 400, vars?: Record<string, string | number>) {
    super(code);
    this.code = code;
    this.status = status;
    this.vars = vars;
  }
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/* ------------------------------------------------- responsible gaming  */

export function assertCanPlay(u: Pick<User, "selfExcludedUntil">) {
  if (u.selfExcludedUntil && new Date(u.selfExcludedUntil).getTime() > Date.now()) {
    throw new UserError("selfExcluded", 403, { date: new Date(u.selfExcludedUntil).toISOString().slice(0, 16).replace("T", " ") + " UTC" });
  }
}

/** Effective daily limit, applying a matured pending change. */
export function effectiveLimit(u: Pick<User, "depositLimitDaily" | "pendingDepositLimit" | "pendingLimitAt">) {
  if (u.pendingLimitAt && new Date(u.pendingLimitAt).getTime() <= Date.now()) {
    return u.pendingDepositLimit === null ? null : Number(u.pendingDepositLimit);
  }
  return u.depositLimitDaily === null ? null : Number(u.depositLimitDaily);
}

export async function checkDepositLimit(u: User, amount: number) {
  const limit = effectiveLimit(u);
  if (limit === null) return;
  const r = await db
    .select({ total: sql<string>`coalesce(sum(${deposits.amountUsd}),0)` })
    .from(deposits)
    .where(
      and(
        eq(deposits.userId, u.id),
        gte(deposits.createdAt, new Date(Date.now() - 86400000)),
        inArray(deposits.status, ["waiting", "confirming", "confirmed", "sending", "partially_paid", "finished"]),
      ),
    );
  if (Number(r[0]?.total ?? 0) + amount > limit) {
    throw new UserError("depositLimit", 403, { limit: usd(limit) });
  }
}

export async function setDepositLimit(userId: number, amount: number | null) {
  if (amount !== null && (!Number.isFinite(amount) || amount < 1 || amount > 100000)) {
    throw new UserError("badLimit");
  }
  const me = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!me) throw new UserError("userNotFound", 404);
  const current = effectiveLimit(me);
  const lowering = amount !== null && (current === null || amount <= current);
  if (lowering) {
    await db
      .update(users)
      .set({ depositLimitDaily: String(amount), pendingDepositLimit: null, pendingLimitAt: null })
      .where(eq(users.id, userId));
  } else {
    // raising / removing: cooling-off period of 24h
    await db
      .update(users)
      .set({
        depositLimitDaily: current === null ? null : String(current),
        pendingDepositLimit: amount === null ? null : String(amount),
        pendingLimitAt: new Date(Date.now() + 86400000),
      })
      .where(eq(users.id, userId));
  }
}

export async function selfExclude(userId: number, days: number) {
  const allowed = [1, 7, 30, 36500];
  if (!allowed.includes(days)) throw new UserError("badLimit");
  const until = new Date(Date.now() + days * 86400000);
  const me = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!me) throw new UserError("userNotFound", 404);
  // never shorten an existing exclusion
  const keep = me.selfExcludedUntil && new Date(me.selfExcludedUntil) > until ? me.selfExcludedUntil : until;
  await db.update(users).set({ selfExcludedUntil: keep }).where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ utils */

export const makeSerial = () =>
  randomBytes(2).toString("hex").toUpperCase() + "-" + String(randomInt(1000, 10000));

export function makeReferralCode(seed: string) {
  return (
    (seed.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() || "BTX") +
    randomBytes(3).toString("hex").toUpperCase().slice(0, 5)
  );
}

function newSeed() {
  const serverSeed = randomBytes(32).toString("hex");
  const seedHash = createHash("sha256").update(serverSeed).digest("hex");
  return { serverSeed, seedHash };
}

/** Deterministic, publicly verifiable winner index. */
export function fairIndex(serverSeed: string, roundId: number, serials: string[]) {
  const digest = createHmac("sha256", serverSeed)
    .update(`${roundId}:${serials.join(",")}`)
    .digest("hex");
  return parseInt(digest.slice(0, 13), 16) % serials.length;
}

async function openNewRound(q: Q) {
  const { serverSeed, seedHash } = newSeed();
  const created = await q
    .insert(rounds)
    .values({ status: "open", capacity: POOL_CAPACITY, sold: 0, serverSeed, seedHash })
    .returning();
  return created[0];
}

export async function ensureOpenRound() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const open = await tx.select().from(rounds).where(eq(rounds.status, "open")).orderBy(desc(rounds.id)).limit(1);
    return open[0] ?? (await openNewRound(tx));
  });
}

/**
 * Closes a round that never filled and refunds every ticket at face value.
 * Idempotent: only acts on a still-open round with tickets.
 */
export async function refundRound(roundId: number) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const r = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
    if (!r || r.status !== "open" || r.sold === 0) return null;
    const list = await tx.select().from(tickets).where(eq(tickets.roundId, roundId));
    const perUser = new Map<number, { count: number; username: string }>();
    for (const t of list) {
      const cur = perUser.get(t.userId) ?? { count: 0, username: t.username };
      cur.count += 1;
      perUser.set(t.userId, cur);
    }
    for (const [userId, v] of perUser) {
      const amount = v.count * TICKET_PRICE;
      await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
      await tx.insert(ledger).values({
        userId,
        username: v.username,
        type: "ticket_refund",
        amount: String(amount),
        note: `Refund: round ${roundId} expired (${v.count} tickets)`,
      });
    }
    await tx.update(rounds).set({ status: "refunded", drawnAt: new Date() }).where(eq(rounds.id, roundId));
    await tx.update(vault).set({ ticketsSold: sql`greatest(${vault.ticketsSold} - ${r.sold}, 0)`, updatedAt: new Date() });
    await openNewRound(tx);
    return { tickets: list.length, users: [...perUser.entries()].map(([id, v]) => ({ id, count: v.count })) };
  });
}

/**
 * Records the vault balance AFTER a change, inside the caller's transaction,
 * so the candle chart always reflects committed, real balance movements.
 */
export async function recordVaultSnapshot(q: Q, reason: string, delta: number, roundId?: number | null, at?: Date) {
  const v = (await q.select().from(vault).limit(1))[0];
  if (!v) return;
  await q.insert(vaultSnapshots).values({
    balance: String(Number(v.balance)),
    delta: String(delta),
    reason,
    roundId: roundId ?? null,
    ...(at ? { createdAt: at } : {}),
  });
}

/* ------------------------------------------------------------------ seed  */

const SEED_USERS: Array<[string, string]> = [
  ["alex_m", "Alex M."],
  ["sofia_r", "Sofía R."],
  ["amir_h", "Amir H."],
  ["mehmet_y", "Mehmet Y."],
  ["olga_p", "Olga P."],
  ["layla_a", "Layla A."],
  ["diego_c", "Diego C."],
  ["kenji_t", "Kenji T."],
];

let seeded = false;
let seedPromise: Promise<void> | null = null;

export async function ensureSeed(): Promise<void> {
  if (seeded) return;
  if (!seedPromise) {
    seedPromise = runSeed()
      .then(() => {
        seeded = true;
      })
      .catch((e) => {
        seedPromise = null;
        throw e;
      });
  }
  await seedPromise;
}

async function runSeed() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    const existing = await tx.select().from(vault).limit(1);
    if (existing.length > 0) return;
  
    const initial = String(config.vaultInitial);
    const adminWallet = config.adminWallet;

    // LIVE: never fabricate activity — just the vault, baseline snapshot, and an empty round.
    if (config.live) {
      await tx.insert(vault).values({ balance: initial, initialCapital: initial, adminWallet });
      await tx.insert(vaultSnapshots).values({ balance: initial, delta: "0", reason: "seed" });
      await openNewRound(tx);
      return;
    }

    // DEMO: sample players, 6 finished rounds and a live round at 15/20.
    await tx.insert(vault).values({ balance: initial, initialCapital: initial, adminWallet });
    const seededUsers = await tx
      .insert(users)
      .values(
        SEED_USERS.map(([username, displayName]) => ({
          username,
          displayName,
          telegram: "@" + username,
          referralCode: makeReferralCode(username),
        })),
      )
      .returning();
  
    for (let r = 1; r <= 6; r++) {
      const { serverSeed, seedHash } = newSeed();
      const roundRow = (
        await tx
          .insert(rounds)
          .values({ status: "open", capacity: POOL_CAPACITY, sold: POOL_CAPACITY, serverSeed, seedHash })
          .returning()
      )[0];
      const roundTickets = Array.from({ length: POOL_CAPACITY }, (_, i) => {
        const u = seededUsers[(r * 3 + i * 5) % seededUsers.length];
        return { roundId: roundRow.id, userId: u.id, username: u.username, kind: "gold", serial: makeSerial() };
      });
      const inserted = await tx.insert(tickets).values(roundTickets).returning();
      const idx = fairIndex(serverSeed, roundRow.id, inserted.map((t) => t.serial));
      const w = inserted[idx];
      const wu = seededUsers.find((u) => u.id === w.userId)!;
      await tx
        .update(rounds)
        .set({
          status: "drawn",
          winnerId: w.userId,
          winnerName: wu.displayName,
          winningSerial: w.serial,
          drawnAt: new Date(Date.now() - (7 - r) * 5.5 * 3600 * 1000),
          feeStatus: "accrued",
        })
        .where(eq(rounds.id, roundRow.id));
      await tx.update(users).set({ balance: sql`${users.balance} + ${PRIZE}` }).where(eq(users.id, w.userId));
      await tx.insert(ledger).values({
        userId: w.userId,
        username: w.username,
        type: "prize",
        amount: String(PRIZE),
        note: `Winner of round ${roundRow.id}`,
      });
      await tx.insert(feeTransfers).values({
        roundId: roundRow.id,
        amount: String(FEE),
        adminWallet,
        status: "accrued",
      });
    }

    const live = await openNewRound(tx);
    await tx.insert(tickets).values(
      Array.from({ length: 15 }, (_, i) => {
        const u = seededUsers[i % seededUsers.length];
        return { roundId: live.id, userId: u.id, username: u.username, kind: "gold", serial: makeSerial() };
      }),
    );
    await tx.update(rounds).set({ sold: 15 }).where(eq(rounds.id, live.id));
  
    await tx.update(vault).set({
      balance: String(config.vaultInitial + 6 * FEE),
      totalFees: String(6 * FEE),
      adminEarnings: String(6 * FEE),
      totalPaid: String(6 * PRIZE),
      roundsCompleted: 6,
      ticketsSold: 6 * POOL_CAPACITY + 15,
      updatedAt: new Date(),
    });

    // sample history for the candle chart: a baseline, then one snapshot per sample draw
    await tx.insert(vaultSnapshots).values([
      { balance: initial, delta: "0", reason: "seed", createdAt: new Date(Date.now() - 8 * 5.5 * 3600 * 1000) },
      ...Array.from({ length: 6 }, (_, i) => ({
        balance: String(config.vaultInitial + (i + 1) * FEE),
        delta: String(FEE),
        reason: "draw",
        roundId: null,
        createdAt: new Date(Date.now() - (6 - i) * 5.5 * 3600 * 1000),
      })),
    ]);
  
  });
}

/**
 * One-time self-heal for databases created before treasury tracking:
 * backfills missing fee rows for old drawn rounds and aligns adminEarnings
 * with totalFees. Idempotent and safe to call on every boot.
 */
export async function ensureTreasuryBackfill(): Promise<void> {
  const v = (await db.select().from(vault).limit(1))[0];
  if (!v) return;
  if (!v.adminWallet) {
    await db.update(vault).set({ adminWallet: config.adminWallet }).where(eq(vault.id, v.id));
  }
  const [drawn, existing] = await Promise.all([
    db.select().from(rounds).where(eq(rounds.status, "drawn")),
    db.select({ roundId: feeTransfers.roundId }).from(feeTransfers),
  ]);
  const have = new Set(existing.map((r) => r.roundId));
  const missing = drawn.filter((r) => !have.has(r.id));
  if (missing.length > 0) {
    await db.transaction(async (tx) => {
      for (const r of missing) {
        await tx
          .insert(feeTransfers)
          .values({
            roundId: r.id,
            amount: String(Number(r.fee)),
            adminWallet: v.adminWallet ?? config.adminWallet,
            status: "accrued",
          })
          .onConflictDoNothing();
        await tx.update(rounds).set({ feeStatus: "accrued" }).where(eq(rounds.id, r.id));
      }
      const cur = (await tx.select().from(vault).limit(1).for("update"))[0];
      if (Number(cur.adminEarnings) < Number(cur.totalFees)) {
        await tx
          .update(vault)
          .set({ adminEarnings: cur.totalFees, adminWallet: config.adminWallet, updatedAt: new Date() });
      }
    });
  } else if (Number(v.adminEarnings) < Number(v.totalFees)) {
    await db.update(vault).set({ adminEarnings: v.totalFees, updatedAt: new Date() }).where(eq(vault.id, v.id));
  }
}

/* ---------------------------------------------------------------- session */

/* Signed session token: "v1.<userId>.<expiresAt>.<hmac>" (HMAC-SHA256).
 * A raw user id is never trusted — editing the cookie invalidates it. */
const SESSION_TTL_S = 60 * 60 * 24 * 30;

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // fallback keeps dev/preview working; readiness check flags it for production
  return createHash("sha256")
    .update(`betx-session|${process.env.DATABASE_URL ?? ""}|${process.env.ADMIN_TOKEN ?? ""}`)
    .digest("hex");
}

function signSession(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function makeSessionToken(userId: number, now = Date.now()) {
  const payload = `v1.${userId}.${Math.floor(now / 1000) + SESSION_TTL_S}`;
  return `${payload}.${signSession(payload)}`;
}

/** Returns the user id if the token is authentic and unexpired, else null. */
export function readSessionToken(token: string | undefined | null, now = Date.now()): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, idStr, expStr, sig] = parts;
  const id = Number(idStr);
  const exp = Number(expStr);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(exp)) return null;
  if (exp * 1000 < now) return null;
  const expected = Buffer.from(signSession(`v1.${idStr}.${expStr}`));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  return id;
}

export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const id = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (id === null) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setSession(userId: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && config.appUrl.startsWith("https"),
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

/* ---------------------------------------------------------------- referral */

/** Called once when a brand-new user signs up with a code. */
export async function rewardSignupReferral(q: Q, inviteeId: number, code: string) {
  const r = await q.select().from(users).where(eq(users.referralCode, code)).limit(1);
  const inviter = r[0];
  if (!inviter || inviter.id === inviteeId) return null;
  await q.update(users).set({ referredBy: code }).where(eq(users.id, inviteeId));
  await q
    .update(users)
    .set({ bonusSpins: sql`${users.bonusSpins} + 1` })
    .where(eq(users.id, inviter.id));
  await q.insert(ledger).values({
    userId: inviter.id,
    username: inviter.username,
    type: "referral",
    amount: "0",
    note: "+1 bonus spin: friend joined",
  });
  return inviter;
}

/* ------------------------------------------------------------------ wheel */

export function pickSectorIndex() {
  const total = WHEEL_SECTORS.reduce((a, s) => a + s.weight, 0);
  let r = randomInt(0, total);
  for (let i = 0; i < WHEEL_SECTORS.length; i++) {
    r -= WHEEL_SECTORS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

async function lastSpin(q: Q, userId: number) {
  const last = await q
    .select()
    .from(wheelSpins)
    .where(eq(wheelSpins.userId, userId))
    .orderBy(desc(wheelSpins.createdAt))
    .limit(1);
  return last[0] ?? null;
}

export async function canSpin(q: Q, userId: number, bonusSpins: number) {
  if (bonusSpins > 0) return true;
  const last = await lastSpin(q, userId);
  return !last || Date.now() - new Date(last.createdAt).getTime() >= SPIN_COOLDOWN_MS;
}

export async function spinWheel(userId: number) {
  return db.transaction(async (tx) => {
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    assertCanPlay(me);
    const last = await lastSpin(tx, me.id);
    const freeSpinReady = !last || Date.now() - new Date(last.createdAt).getTime() >= SPIN_COOLDOWN_MS;
    if (!freeSpinReady && me.bonusSpins < 1) {
      throw new UserError("spinTomorrow", 429);
    }
    const v = (await tx.select().from(vault).limit(1).for("update"))[0];
    const profit = Number(v.balance) - Number(v.initialCapital);

    let index = pickSectorIndex();
    // the vault floor is sacred: spins only pay from realised profit
    if (WHEEL_SECTORS[index].value > profit) {
      index = WHEEL_SECTORS.findIndex((s) => s.value === 0.1);
    }
    const prize = profit >= WHEEL_SECTORS[index].value ? WHEEL_SECTORS[index].value : 0;

    await tx.insert(wheelSpins).values({ userId: me.id, prize: String(prize) });
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${prize}`,
        bonusSpins: Math.max(0, me.bonusSpins - (freeSpinReady ? 0 : 1)),
      })
      .where(eq(users.id, me.id));
    if (prize > 0) {
      await tx.update(vault).set({ balance: sql`${vault.balance} - ${prize}`, updatedAt: new Date() });
      await recordVaultSnapshot(tx, "spin", -prize);
    }
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "spin",
      amount: String(prize),
      note: "Daily wheel prize",
    });
    return { index, prize };
  });
}

/* --------------------------------------------------------------- tickets  */

export interface DrawOutcome {
  winnerName: string;
  winnerTelegramId: string | null;
  winnerLocale: string;
  winningSerial: string;
  prize: number;
  fee: number;
  roundId: number;
  serverSeed: string;
  drawnAt: string;
  adminWallet: string;
  serials: string[];
  youWon: boolean;
  yourTickets: number;
  winnerUserId: number;
  participants: { userId: number; telegramId: string | null; locale: string; ticketCount: number }[];
}

/**
 * Fully automatic draw. Runs inside the caller's transaction (which must hold
 * the round advisory lock). Idempotent: if the round is no longer open, or
 * its actual gold-ticket count is below capacity, it does nothing and
 * returns null instead of drawing twice.
 *
 * Atomically, in ONE transaction:
 *  1. picks a random winner among GOLD tickets only (provably fair),
 *  2. credits the $15 prize to the winner's balance,
 *  3. credits the $5 fee to the vault AND allocates it to the admin wallet,
 *  4. closes the round and opens the next one automatically.
 */
async function drawRound(
  tx: Tx,
  roundId: number,
  serverSeed: string,
  buyerId: number,
): Promise<DrawOutcome | null> {
  const row = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
  if (!row || row.status !== "open") return null;

  const pool = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
    .orderBy(tickets.id);

  // Trust the actual tickets, not just the counter (self-heals any drift).
  if (pool.length < row.capacity) {
    if (row.sold !== pool.length) {
      await tx.update(rounds).set({ sold: pool.length }).where(eq(rounds.id, roundId));
    }
    return null;
  }
  if (row.sold !== pool.length) {
    await tx.update(rounds).set({ sold: pool.length }).where(eq(rounds.id, roundId));
  }

  const prize = Number(row.prize);
  const fee = Number(row.fee);
  const adminWallet = config.adminWallet;
  const winner = pool[fairIndex(serverSeed, roundId, pool.map((t) => t.serial))];
  const winnerRow = (await tx.select().from(users).where(eq(users.id, winner.userId)).limit(1))[0];
  const participantCounts = new Map<number, number>();
  for (const ticket of pool) participantCounts.set(ticket.userId, (participantCounts.get(ticket.userId) ?? 0) + 1);
  const participantRows = await tx
    .select({ id: users.id, telegramId: users.telegramId, locale: users.locale })
    .from(users)
    .where(inArray(users.id, [...participantCounts.keys()]));
  const winnerName = winnerRow?.displayName ?? winner.username;
  const drawnAt = new Date();

  await tx
    .update(rounds)
    .set({
      status: "drawn",
      winnerId: winner.userId,
      winnerName,
      winningSerial: winner.serial,
      drawnAt,
      feeStatus: "accrued",
    })
    .where(eq(rounds.id, roundId));

  // 1) prize → winner balance
  await tx.update(users).set({ balance: sql`${users.balance} + ${prize}` }).where(eq(users.id, winner.userId));

  // 2) fee → vault balance + admin treasury allocation (same transaction)
  await tx.update(vault).set({
    balance: sql`${vault.balance} + ${fee}`,
    totalFees: sql`${vault.totalFees} + ${fee}`,
    adminEarnings: sql`${vault.adminEarnings} + ${fee}`,
    adminWallet,
    totalPaid: sql`${vault.totalPaid} + ${prize}`,
    roundsCompleted: sql`${vault.roundsCompleted} + 1`,
    updatedAt: new Date(),
  });
  await recordVaultSnapshot(tx, "draw", FEE, roundId);
  await tx
    .insert(feeTransfers)
    .values({ roundId, amount: String(fee), adminWallet, status: "accrued" })
    .onConflictDoNothing();

  // 3) transparent double ledger: prize for the winner, fee for the treasury
  await tx.insert(ledger).values({
    userId: winner.userId,
    username: winner.username,
    type: "prize",
    amount: String(prize),
    note: `Winner of round ${roundId} · $${fee.toFixed(2)} fee to treasury ${adminWallet}`,
  });
  await tx.insert(ledger).values({
    userId: null,
    username: "treasury",
    type: "fee",
    amount: String(fee),
    note: `Round ${roundId} platform fee → ${adminWallet}`,
  });

  // 4) next round opens automatically — the pool never stalls
  await openNewRound(tx);

  return {
    winnerName,
    winnerTelegramId: winnerRow?.telegramId ?? null,
    winnerLocale: winnerRow?.locale ?? "en",
    winningSerial: winner.serial,
    prize,
    fee,
    roundId,
    serverSeed,
    drawnAt: drawnAt.toISOString(),
    adminWallet,
    serials: pool.map((t) => t.serial),
    youWon: winner.userId === buyerId,
    yourTickets: pool.filter((t) => t.userId === buyerId).length,
    winnerUserId: winner.userId,
    participants: participantRows.map((u) => ({
      userId: u.id,
      telegramId: u.telegramId,
      locale: u.locale,
      ticketCount: participantCounts.get(u.id) ?? 0,
    })),
  };
}

/**
 * Safety net for full automation: draws EVERY open round whose ticket count
 * has reached capacity. Called by the buy flow (fast path) and by the
 * autopilot cron (catches crashes, manual DB edits, or any missed trigger).
 * Each round is drawn in its own locked transaction — never twice.
 */
export async function autoDrawFullRounds(triggerUserId = 0): Promise<DrawOutcome[]> {
  const open = await db.select().from(rounds).where(eq(rounds.status, "open")).orderBy(rounds.id);
  const outcomes: DrawOutcome[] = [];
  for (const r of open) {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
      return drawRound(tx, r.id, r.serverSeed ?? newSeed().serverSeed, triggerUserId);
    });
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

/** Public paginated draw history for the transparent winners table. */
export async function getDrawHistory(limit = 20, offset = 0) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const [total, rows] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(rounds).where(eq(rounds.status, "drawn")),
    db
      .select()
      .from(rounds)
      .where(eq(rounds.status, "drawn"))
      .orderBy(desc(rounds.id))
      .limit(safeLimit)
      .offset(safeOffset),
  ]);
  return {
    total: total[0]?.c ?? 0,
    limit: safeLimit,
    offset: safeOffset,
    draws: rows.map((w) => ({
      roundId: w.id,
      winnerName: w.winnerName ?? "—",
      winningSerial: w.winningSerial ?? "—",
      prize: Number(w.prize),
      fee: Number(w.fee),
      capacity: w.capacity,
      sold: w.sold,
      drawnAt: w.drawnAt ? new Date(w.drawnAt).toISOString() : null,
      openedAt: w.openedAt ? new Date(w.openedAt).toISOString() : null,
      seedHash: w.seedHash,
      serverSeed: w.serverSeed,
      feeStatus: (w as { feeStatus?: string }).feeStatus ?? "accrued",
      feeTxHash: (w as { feeTxHash?: string | null }).feeTxHash ?? null,
    })),
  };
}

export async function buyTickets(userId: number, requested: number) {
  const count = Math.min(10, Math.max(1, Math.floor(requested) || 1));
  await ensureSeed();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    assertCanPlay(me);

    let round = (
      await tx.select().from(rounds).where(eq(rounds.status, "open")).orderBy(desc(rounds.id)).limit(1).for("update")
    )[0];
    if (!round) round = await openNewRound(tx);

    const take = Math.min(count, round.capacity - round.sold);
    if (take <= 0) throw new UserError("roundFull");

    const cost = take * TICKET_PRICE;
    if (Number(me.balance) < cost) {
      throw new UserError("insufficient", 402, { n: take, cost: usd(cost) });
    }

    let firstGoldenTicket = false;
    if (me.referredBy) {
      const [previousTickets] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tickets)
        .where(and(eq(tickets.userId, me.id), eq(tickets.kind, "gold")));
      firstGoldenTicket = (previousTickets?.count ?? 0) === 0;
    }

    const created = await tx
      .insert(tickets)
      .values(
        Array.from({ length: take }, () => ({
          roundId: round.id,
          userId: me.id,
          username: me.username,
          kind: "gold",
          serial: makeSerial(),
        })),
      )
      .returning();

    await tx.update(users).set({ balance: sql`${users.balance} - ${cost}` }).where(eq(users.id, me.id));
    await tx.update(rounds).set({ sold: round.sold + take }).where(eq(rounds.id, round.id));
    await tx.update(vault).set({ ticketsSold: sql`${vault.ticketsSold} + ${take}`, updatedAt: new Date() });
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "ticket_buy",
      amount: String(-cost),
      note: `${take} golden tickets · round ${round.id}`,
    });

    if (firstGoldenTicket && me.referredBy) {
      const inviter = (
        await tx.select().from(users).where(eq(users.referralCode, me.referredBy)).limit(1)
      )[0];
      if (inviter && inviter.id !== me.id) {
        await tx
          .update(users)
          .set({ bonusSpins: sql`${users.bonusSpins} + 1` })
          .where(eq(users.id, inviter.id));
        await tx.insert(ledger).values({
          userId: inviter.id,
          username: inviter.username,
          type: "referral",
          amount: "0",
          note: `Golden ticket referral spin (${me.username})`,
        });
      }
    }

    let draw = null;
    if (round.sold + take >= round.capacity) {
      draw = await drawRound(tx, round.id, round.serverSeed ?? newSeed().serverSeed, me.id);
    }

    return { serials: created.map((t) => t.serial), roundId: round.id, draw };
  });
}

/* --------------------------------------------------------------- deposits */

/**
 * Idempotently credit a confirmed deposit. Safe to call any number of times
 * for the same deposit (duplicate webhooks, retries, manual reconciliation).
 */
export async function creditDeposit(depositId: number, status = "finished") {
  return db.transaction(async (tx) => {
    const dep = (await tx.select().from(deposits).where(eq(deposits.id, depositId)).for("update"))[0];
    if (!dep) return null;
    if (dep.credited) return { alreadyCredited: true as const, deposit: dep, inviter: null, user: null };

    const amount = Number(dep.amountUsd);
    await tx
      .update(deposits)
      .set({ credited: true, status, updatedAt: new Date() })
      .where(eq(deposits.id, dep.id));

    const me = (await tx.select().from(users).where(eq(users.id, dep.userId)).for("update"))[0];
    const firstDeposit = Number(me.totalDeposited) === 0;
    await tx
      .update(users)
      .set({
        balance: sql`${users.balance} + ${amount}`,
        totalDeposited: sql`${users.totalDeposited} + ${amount}`,
      })
      .where(eq(users.id, me.id));
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "deposit",
      amount: String(amount),
      note: dep.provider === "demo" ? "Demo top-up" : `Deposit ${dep.payCurrency.toUpperCase()}`,
    });

    // referral cash bonus on the invitee's first deposit — paid from vault profit only
    let inviter: User | null = null;
    if (firstDeposit && me.referredBy && dep.provider !== "demo") {
      const bonus = config.limits.referralDepositBonus;
      const v = (await tx.select().from(vault).limit(1).for("update"))[0];
      const ref = (await tx.select().from(users).where(eq(users.referralCode, me.referredBy)).limit(1))[0];
      if (ref && Number(v.balance) - Number(v.initialCapital) >= bonus) {
        inviter = ref;
        await tx.update(users).set({ balance: sql`${users.balance} + ${bonus}` }).where(eq(users.id, ref.id));
        await tx.update(vault).set({ balance: sql`${vault.balance} - ${bonus}`, updatedAt: new Date() });
        await recordVaultSnapshot(tx, "referral", -bonus);
        await tx.insert(ledger).values({
          userId: ref.id,
          username: ref.username,
          type: "referral",
          amount: String(bonus),
          note: `Referral first-deposit bonus (${me.username})`,
        });
      }
    }

    return { alreadyCredited: false as const, deposit: dep, inviter, user: me };
  });
}

/* ------------------------------------------------------------ withdrawals */

export const TRC20_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export async function requestWithdrawal(userId: number, amount: number, address: string) {
  const amt = Math.round(amount * 100) / 100;
  if (!Number.isFinite(amt) || amt < config.limits.minWithdraw) {
    throw new UserError("withdrawMin", 400, { min: usd(config.limits.minWithdraw) });
  }
  if (!TRC20_RE.test(address) || !isTronAddress(address)) {
    throw new UserError("badAddress");
  }
  return db.transaction(async (tx) => {
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    if (Number(me.balance) < amt) throw new UserError("balanceLow");
    const pending = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, me.id), eq(withdrawals.status, "pending")));
    if ((pending[0]?.c ?? 0) > 0) throw new UserError("wdPending");

    await tx
      .update(users)
      .set({ balance: sql`${users.balance} - ${amt}`, payoutAddress: address })
      .where(eq(users.id, me.id));
    const w = (
      await tx
        .insert(withdrawals)
        .values({ userId: me.id, username: me.username, amount: String(amt), address })
        .returning()
    )[0];
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "withdraw_request",
      amount: String(-amt),
      note: `Withdrawal request #${w.id}`,
    });
    return w;
  });
}

export async function processWithdrawal(id: number, action: "paid" | "rejected", txHash?: string, note?: string) {
  return db.transaction(async (tx) => {
    const w = (await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).for("update"))[0];
    if (!w) throw new UserError("wdNotFound", 404);
    if (w.status !== "pending") throw new UserError("wdProcessed");
    await tx
      .update(withdrawals)
      .set({ status: action, txHash: txHash || null, note: note || null, processedAt: new Date() })
      .where(eq(withdrawals.id, id));
    if (action === "rejected") {
      await tx.update(users).set({ balance: sql`${users.balance} + ${w.amount}` }).where(eq(users.id, w.userId));
      await tx.insert(ledger).values({
        userId: w.userId,
        username: w.username,
        type: "withdraw_refund",
        amount: String(w.amount),
        note: `Withdrawal refund #${w.id}`,
      });
    }
    const u = (await tx.select().from(users).where(eq(users.id, w.userId)).limit(1))[0];
    return { withdrawal: { ...w, status: action }, telegramId: u?.telegramId ?? null, locale: u?.locale ?? "en" };
  });
}

/* ------------------------------------------------------------------ state */

export async function getState() {
  await ensureSeed();
  await ensureTreasuryBackfill().catch(() => {});
  const me = await getSessionUser();
  const region = regionStatus(await headers());

  const round = await ensureOpenRound();
  const v = (await db.select().from(vault).limit(1))[0];

  const recent = await db
    .select()
    .from(ledger)
    .where(inArray(ledger.type, ["ticket_buy", "prize"]))
    .orderBy(desc(ledger.id))
    .limit(10);
  // privacy: never expose full usernames of other players in the public feed
  const mask = (u: string | null) => (u ? (u.length <= 3 ? u[0] + "**" : u.slice(0, 3) + "***") : "***");

  const [roundTickets, winners, players, last24, feeQueue] = await Promise.all([
    db.select().from(tickets).where(eq(tickets.roundId, round.id)).orderBy(tickets.id),
    db.select().from(rounds).where(eq(rounds.status, "drawn")).orderBy(desc(rounds.id)).limit(20),
    db.select({ c: sql<number>`count(*)::int` }).from(users),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tickets)
      .where(gte(tickets.createdAt, new Date(Date.now() - 86400000))),
    db
      .select({ c: sql<number>`count(*)::int`, s: sql<string>`coalesce(sum(${feeTransfers.amount}),0)` })
      .from(feeTransfers)
      .where(inArray(feeTransfers.status, ["accrued", "queued", "processing"])),
  ]);

  const board = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      tickets: sql<number>`count(${tickets.id})::int`,
    })
    .from(users)
    .innerJoin(tickets, eq(tickets.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${tickets.id})`))
    .limit(6);
  const winnings = board.length
    ? await db
        .select({ userId: ledger.userId, total: sql<string>`coalesce(sum(${ledger.amount}),0)` })
        .from(ledger)
        .where(and(eq(ledger.type, "prize"), inArray(ledger.userId, board.map((b) => b.id))))
        .groupBy(ledger.userId)
    : [];

  let user = null;
  if (me) {
    const [myDeposits, myWithdrawals, last, myTickets] = await Promise.all([
      db.select().from(deposits).where(eq(deposits.userId, me.id)).orderBy(desc(deposits.id)).limit(5),
      db.select().from(withdrawals).where(eq(withdrawals.userId, me.id)).orderBy(desc(withdrawals.id)).limit(5),
      lastSpin(db, me.id),
      db
        .select({ ticket: tickets, round: rounds })
        .from(tickets)
        .innerJoin(rounds, eq(tickets.roundId, rounds.id))
        .where(eq(tickets.userId, me.id))
        .orderBy(desc(tickets.id))
        .limit(50),
    ]);
    const spinReady =
      me.bonusSpins > 0 || !last || Date.now() - new Date(last.createdAt).getTime() >= SPIN_COOLDOWN_MS;
    user = {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
      telegram: me.telegram,
      telegramLinked: Boolean(me.telegramId),
      walletAddress: me.walletAddress,
      referralCode: me.referralCode,
      balance: Number(me.balance),
      totalDeposited: Number(me.totalDeposited),
      payoutAddress: me.payoutAddress,
      bonusSpins: me.bonusSpins,
      tickets: myTickets.map(({ ticket, round: ticketRound }) => ({
        id: ticket.id,
        roundId: ticket.roundId,
        serial: ticket.serial,
        kind: ticket.kind,
        createdAt: new Date(ticket.createdAt).toISOString(),
        status:
          ticketRound.status === "refunded"
            ? "refunded"
            : ticketRound.status !== "drawn"
              ? "pending"
              : ticket.serial === ticketRound.winningSerial
                ? "winner"
                : "lost",
        prize: ticket.serial === ticketRound.winningSerial ? Number(ticketRound.prize) : 0,
        winningSerial: ticketRound.winningSerial,
      })),
      locale: me.locale,
      termsAccepted: Boolean(me.termsAcceptedAt),
      selfExcludedUntil:
        me.selfExcludedUntil && new Date(me.selfExcludedUntil).getTime() > Date.now()
          ? new Date(me.selfExcludedUntil).toISOString()
          : null,
      depositLimit: effectiveLimit(me),
      pendingLimit:
        me.pendingLimitAt && new Date(me.pendingLimitAt).getTime() > Date.now()
          ? { amount: me.pendingDepositLimit === null ? null : Number(me.pendingDepositLimit), at: new Date(me.pendingLimitAt).toISOString() }
          : null,
      canSpin: spinReady,
      nextSpinAt:
        spinReady || !last ? null : new Date(new Date(last.createdAt).getTime() + SPIN_COOLDOWN_MS).toISOString(),
      deposits: myDeposits.map((d) => ({
        id: d.id,
        amount: Number(d.amountUsd),
        status: d.status,
        credited: d.credited,
        provider: d.provider,
        invoiceUrl: d.credited ? null : d.invoiceUrl,
        createdAt: new Date(d.createdAt).toISOString(),
      })),
      withdrawals: myWithdrawals.map((w) => ({
        id: w.id,
        amount: Number(w.amount),
        address: w.address,
        status: w.status,
        txHash: w.txHash,
        createdAt: new Date(w.createdAt).toISOString(),
      })),
    };
  }

  return {
    config: {
      ...publicConfig(),
      tron: {
        enabled: tron.enabled,
        network: tron.network,
        depositAddress: tron.enabled ? tron.depositAddress : null,
        explorer: tron.explorer,
      },
    },
    region,
    vault: {
      balance: Number(v.balance),
      initialCapital: Number(v.initialCapital),
      totalFees: Number(v.totalFees),
      totalPaid: Number(v.totalPaid),
      roundsCompleted: v.roundsCompleted,
      ticketsSold: v.ticketsSold,
      adminWallet: v.adminWallet ?? config.adminWallet,
      adminEarnings: Number(v.adminEarnings ?? v.totalFees),
      adminPaid: Number(v.adminPaid ?? 0),
      feePending: Number(feeQueue[0]?.s ?? 0),
      feePendingCount: feeQueue[0]?.c ?? 0,
    },
    round: {
      id: round.id,
      capacity: round.capacity,
      sold: round.sold,
      remaining: Math.max(0, round.capacity - round.sold),
      prize: Number(round.prize),
      fee: Number(round.fee),
      seedHash: round.seedHash,
      tickets: roundTickets.map((t) => ({
        id: t.id,
        serial: t.serial,
        username: t.username,
        kind: t.kind,
        mine: me ? t.userId === me.id : false,
      })),
    },
    winners: winners.map((w) => ({
      roundId: w.id,
      winnerName: w.winnerName ?? "—",
      winningSerial: w.winningSerial ?? "—",
      prize: Number(w.prize),
      fee: Number(w.fee),
      capacity: w.capacity,
      sold: w.sold,
      drawnAt: w.drawnAt ? new Date(w.drawnAt).toISOString() : null,
      openedAt: w.openedAt ? new Date(w.openedAt).toISOString() : null,
      seedHash: w.seedHash,
      serverSeed: w.serverSeed,
      feeStatus: w.feeStatus ?? "accrued",
      feeTxHash: w.feeTxHash ?? null,
    })),
    leaderboard: board.map((b) => ({
      username: b.username,
      displayName: b.displayName,
      tickets: Number(b.tickets ?? 0),
      won: Number(winnings.find((x) => x.userId === b.id)?.total ?? 0),
    })),
    stats: { players: players[0]?.c ?? 0, ticketsLast24: last24[0]?.c ?? 0 },
    activity: recent.map((r) => ({
      id: r.id,
      type: r.type as "ticket_buy" | "prize",
      user: mask(r.username),
      amount: Math.abs(Number(r.amount)),
      at: new Date(r.createdAt).toISOString(),
    })),
    user,
  };
}
