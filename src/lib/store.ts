import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  deposits,
  adminAuditLog,
  feeTransfers,
  vaultSnapshots,
  ledger,
  rounds,
  tickets,
  users,
  vault,
  wheelSpins,
  withdrawals,
  type Round,
  type Ticket,
  type User,
} from "@/db/schema";
import { config, publicConfig } from "@/lib/config";
import { WHEEL_SECTORS } from "@/lib/wheel";
import type { Dict } from "@/i18n/dictionaries/en";
import { regionStatus } from "@/lib/geo";
import { headers } from "next/headers";
import { isTronAddress, lookupUsdtTransfers, toUnits, tron } from "@/lib/tron";
import { getRoundAccountingEntries, getTicketPurchaseCount } from "@/lib/roundAccounting";
import { effectiveLimit } from "@/lib/responsibleGaming";

export { money } from "@/lib/format";
export { effectiveLimit } from "@/lib/responsibleGaming";

export const SESSION_COOKIE = "betx_session";
export const TICKET_PRICE = 1;
export const POOL_CAPACITY = 20;
export const TOTAL_TICKET_REVENUE = TICKET_PRICE * POOL_CAPACITY;
export const PRIZE = 15;
export const TREASURY_CONTRIBUTION = 3;
export const ADMIN_GROSS_REVENUE = 2;
export const FEE = TREASURY_CONTRIBUTION + ADMIN_GROSS_REVENUE;
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

export async function setDepositLimit(userId: number, amount: number | null) {
  if (amount !== null && (!Number.isFinite(amount) || amount < 1 || amount > 100000)) {
    throw new UserError("badLimit");
  }
  await db.transaction(async (tx) => {
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    const current = effectiveLimit(me);
    const lowering = amount !== null && (current === null || amount <= current);
    if (lowering) {
      await tx
        .update(users)
        .set({ depositLimitDaily: String(amount), pendingDepositLimit: null, pendingLimitAt: null })
        .where(eq(users.id, userId));
    } else {
      await tx
        .update(users)
        .set({
          depositLimitDaily: current === null ? null : String(current),
          pendingDepositLimit: amount === null ? null : String(amount),
          pendingLimitAt: new Date(Date.now() + 86400000),
        })
        .where(eq(users.id, userId));
    }
  });
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

export const ROUND_STATUSES = {
  LOCKED: "LOCKED",
  OPEN: "OPEN",
  FULL: "FULL",
  AWAITING_ADMIN_APPROVAL: "AWAITING_ADMIN_APPROVAL",
  APPROVED: "APPROVED",
  SETTLED: "SETTLED",
  CANCELLED: "CANCELLED",
  REFUND_PENDING: "REFUND_PENDING",
  REFUNDED: "REFUNDED",
} as const;

const SALES_ELIGIBLE_ROUND_STATUSES = [
  ROUND_STATUSES.OPEN,
  ROUND_STATUSES.FULL,
  ROUND_STATUSES.AWAITING_ADMIN_APPROVAL,
  ROUND_STATUSES.APPROVED,
  ROUND_STATUSES.SETTLED,
  "open",
  "full",
  "drawn",
  "settled",
];
const SETTLED_ROUND_STATUSES = [ROUND_STATUSES.SETTLED, "settled"];

export function normalizeRoundStatus(status: string | null | undefined) {
  if (!status) return "LOCKED";
  const mapped = String(status).trim().toUpperCase();
  switch (mapped) {
    case "DRAWN":
      return ROUND_STATUSES.AWAITING_ADMIN_APPROVAL;
    case "REFUNDED":
      return ROUND_STATUSES.REFUNDED;
    case "OPEN":
      return ROUND_STATUSES.OPEN;
    case "FULL":
      return ROUND_STATUSES.FULL;
    default:
      return mapped;
  }
}

/** Deterministic, publicly verifiable winner index. */
export function fairIndex(serverSeed: string, roundId: number, serials: string[]) {
  const digest = createHmac("sha256", serverSeed)
    .update(`${roundId}:${serials.join(",")}`)
    .digest("hex");
  return parseInt(digest.slice(0, 13), 16) % serials.length;
}

function verifyStoredDraw(
  row: Pick<Round, "id" | "serverSeed" | "seedHash" | "winnerId" | "winningSerial">,
  pool: Pick<Ticket, "serial" | "userId">[],
) {
  if (!row.serverSeed || !row.seedHash || !row.winnerId || !row.winningSerial || pool.length !== POOL_CAPACITY) return false;
  if (createHash("sha256").update(row.serverSeed).digest("hex") !== row.seedHash) return false;
  const winner = pool[fairIndex(row.serverSeed, row.id, pool.map((ticket) => ticket.serial))];
  return winner?.serial === row.winningSerial && winner.userId === row.winnerId;
}

async function openNewRound(q: Q) {
  const { serverSeed, seedHash } = newSeed();
  const created = await q
    .insert(rounds)
    .values({
      status: ROUND_STATUSES.OPEN,
      capacity: POOL_CAPACITY,
      sold: 0,
      prize: String(PRIZE),
      fee: String(FEE),
      treasuryContribution: String(TREASURY_CONTRIBUTION),
      adminGrossRevenue: String(ADMIN_GROSS_REVENUE),
      serverSeed,
      seedHash,
    })
    .returning();
  return created[0];
}

export async function initializeAdminVault(actor: string) {
  const initialCapital = config.vaultInitial;
  const adminWallet = config.adminWallet;
  if (!adminWallet) throw new Error("ADMIN_WALLET must be configured before vault initialization");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424241)`);
    const existing = (await tx.select({ id: vault.id }).from(vault).limit(1).for("update"))[0];
    if (existing) throw new Error("Vault already exists; initialization will not modify existing balances");
    const created = (
      await tx
        .insert(vault)
        .values({
          balance: String(initialCapital),
          initialCapital: String(initialCapital),
          adminWallet,
        })
        .returning()
    )[0];
    await tx.insert(ledger).values([
      {
        userId: null,
        username: "accounting",
        type: "vault_seed",
        amount: String(initialCapital),
        note: "Explicit initial vault capital",
        account: "vault_balance",
        reference: randomUUID(),
        transactionKey: "initial-capital:vault",
      },
      {
        userId: null,
        username: "accounting",
        type: "initial_capital",
        amount: String(-initialCapital),
        note: "Initial capital source",
        account: "initial_capital_source",
        reference: randomUUID(),
        transactionKey: "initial-capital:source",
      },
    ]);
    await recordVaultSnapshot(tx, "initial_capital", 0);
    await tx.insert(adminAuditLog).values({
      actor,
      action: "treasury.initialize",
      entity: "vault",
      entityId: created.id,
      details: { initialCapital },
    });
    return created;
  });
}

export async function openAdminRound(actor: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const active = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(inArray(rounds.status, ["OPEN", "FULL", "AWAITING_ADMIN_APPROVAL", "APPROVED"]))
      .limit(1);
    if (active.length) throw new UserError("roundFull", 409);
    const v = (await tx.select({ id: vault.id }).from(vault).limit(1))[0];
    if (!v) throw new Error("Vault must be initialized explicitly before opening a round");
    const round = await openNewRound(tx);
    await tx.insert(adminAuditLog).values({
      actor,
      action: "round.open",
      entity: "round",
      entityId: round.id,
      details: { status: ROUND_STATUSES.OPEN },
    });
    return round;
  });
}

export async function ensureOpenRound() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const open = await tx
      .select()
      .from(rounds)
      .where(inArray(rounds.status, [
        ROUND_STATUSES.OPEN,
        ROUND_STATUSES.FULL,
        ROUND_STATUSES.AWAITING_ADMIN_APPROVAL,
        ROUND_STATUSES.APPROVED,
        "open",
        "full",
        "drawn",
      ]))
      .orderBy(desc(rounds.id))
      .limit(1);
    return open[0] ?? null;
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
    if (!r || normalizeRoundStatus(r.status) !== ROUND_STATUSES.OPEN || r.sold === 0) return null;
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
        account: "user",
        reference: randomUUID(),
        transactionKey: `round:${roundId}:refund:${userId}`,
      });
    }
    await tx.update(rounds).set({ status: ROUND_STATUSES.REFUNDED, drawnAt: new Date() }).where(eq(rounds.id, roundId));
    await tx.update(vault).set({ ticketsSold: sql`greatest(${vault.ticketsSold} - ${r.sold}, 0)`, updatedAt: new Date() });
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

/* ---------------------------------------------------------------- session */

/* Signed session token: "v1.<userId>.<expiresAt>.<hmac>" (HMAC-SHA256).
 * A raw user id is never trusted — editing the cookie invalidates it. */
const SESSION_TTL_S = 60 * 60 * 24 * 30;

function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters");
  }
  return s;
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
    account: "user",
    reference: randomUUID(),
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

    const spin = (await tx.insert(wheelSpins).values({ userId: me.id, prize: String(prize) }).returning({ id: wheelSpins.id }))[0];
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
      await tx.insert(ledger).values({
        userId: null,
        username: "vault",
        type: "vault_spin_debit",
        amount: String(-prize),
        note: `Wheel payout for spin ${spin.id}`,
        account: "vault_balance",
        reference: randomUUID(),
        transactionKey: `wheel-spin:${spin.id}:vault-debit`,
      });
    }
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "spin",
      amount: String(prize),
      note: "Daily wheel prize",
      account: "user",
      reference: randomUUID(),
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
 * Round settlement in two phases:
 *  1. a full round is marked for admin review;
 *  2. an administrator approves the result before financial settlement.
 *
 * This preserves the required admin-controlled lifecycle and prevents the next
 * round from opening automatically when settlement is complete.
 */
async function drawRound(
  tx: Tx,
  roundId: number,
  buyerId: number,
): Promise<DrawOutcome | null> {
  const row = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
  if (!row || !["OPEN", "FULL"].includes(normalizeRoundStatus(row.status))) return null;
  if (!row.serverSeed || !row.seedHash || createHash("sha256").update(row.serverSeed).digest("hex") !== row.seedHash) {
    throw new Error(`Round ${roundId} has no verifiable committed seed`);
  }

  const pool = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
    .orderBy(tickets.id);

  if (pool.length < row.capacity) {
    await tx.update(rounds).set({ sold: pool.length, status: ROUND_STATUSES.OPEN }).where(eq(rounds.id, roundId));
    return null;
  }
  if (pool.length !== POOL_CAPACITY || row.capacity !== POOL_CAPACITY) {
    throw new Error(`Round ${roundId} does not meet the configured ticket capacity`);
  }

  if (row.sold !== pool.length) {
    await tx.update(rounds).set({ sold: pool.length, status: "FULL" }).where(eq(rounds.id, roundId));
  }

  const prize = Number(row.prize);
  const revenue = TOTAL_TICKET_REVENUE;
  const treasuryContribution = TREASURY_CONTRIBUTION;
  const adminGrossRevenue = ADMIN_GROSS_REVENUE;
  const adminWallet = config.adminWallet;
  const winner = pool[fairIndex(row.serverSeed, roundId, pool.map((t) => t.serial))];
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
      status: "AWAITING_ADMIN_APPROVAL",
      winnerId: winner.userId,
      winnerName,
      winningSerial: winner.serial,
      drawnAt,
      feeStatus: "accrued",
    })
    .where(eq(rounds.id, roundId));

  return {
    winnerName,
    winnerTelegramId: winnerRow?.telegramId ?? null,
    winnerLocale: winnerRow?.locale ?? "en",
    winningSerial: winner.serial,
    prize,
    fee: Number(row.fee),
    roundId,
    serverSeed: row.serverSeed,
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
  const open = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.status, [ROUND_STATUSES.OPEN, ROUND_STATUSES.FULL, "open", "full"]))
    .orderBy(rounds.id);
  const outcomes: DrawOutcome[] = [];
  for (const r of open) {
    if ((!r.serverSeed || !r.seedHash) && r.sold < r.capacity) continue;
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
      return drawRound(tx, r.id, triggerUserId);
    });
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

export async function approveRoundResult(roundId: number, approved: boolean, actor: string) {
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
    if (!row) return null;
    const current = normalizeRoundStatus(row.status);
    if (approved && current === ROUND_STATUSES.APPROVED) return { roundId, approved, status: current, alreadyApplied: true };
    if (!approved && current === ROUND_STATUSES.REFUNDED) return { roundId, approved, status: current, alreadyApplied: true };
    if (current !== ROUND_STATUSES.AWAITING_ADMIN_APPROVAL) return null;
    if (approved) {
      if (!row.winnerId || !row.winningSerial || row.sold !== POOL_CAPACITY || row.capacity !== POOL_CAPACITY) return null;
      const pool = await tx
        .select({ serial: tickets.serial, userId: tickets.userId })
        .from(tickets)
        .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
        .orderBy(tickets.id);
      if (!verifyStoredDraw(row, pool)) return null;
    }

    const next = approved ? ROUND_STATUSES.APPROVED : ROUND_STATUSES.REFUNDED;
    let refundedTickets = 0;
    if (!approved) {
      const list = await tx.select().from(tickets).where(eq(tickets.roundId, roundId));
      refundedTickets = list.length;
      const perUser = new Map<number, { count: number; username: string }>();
      for (const ticket of list) {
        const cur = perUser.get(ticket.userId) ?? { count: 0, username: ticket.username };
        cur.count += 1;
        perUser.set(ticket.userId, cur);
      }
      for (const [userId, value] of perUser) {
        const amount = value.count * TICKET_PRICE;
        await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
        await tx.insert(ledger).values({
          userId,
          username: value.username,
          type: "ticket_refund",
          amount: String(amount),
          note: `Refund: round ${roundId} rejected by administrator`,
          account: "user",
          reference: randomUUID(),
          transactionKey: `round:${roundId}:refund:${userId}`,
        });
      }
      await tx.update(vault).set({
        ticketsSold: sql`greatest(${vault.ticketsSold} - ${list.length}, 0)`,
        updatedAt: new Date(),
      });
    }
    await tx
      .update(rounds)
      .set({
        status: next,
        reviewedAt: new Date(),
        approvedAt: approved ? new Date() : null,
        feeStatus: approved ? "accrued" : "failed",
      })
      .where(eq(rounds.id, roundId));
    await tx.insert(adminAuditLog).values({
      actor,
      action: approved ? "round.approve" : "round.reject_and_refund",
      entity: "round",
      entityId: roundId,
      details: { from: current, to: next, refundedTickets },
    });
    return { roundId, approved, status: next };
  });
}

export async function settleApprovedRound(roundId: number, actor: string) {
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
    if (!row) return null;
    if (normalizeRoundStatus(row.status) === ROUND_STATUSES.SETTLED) {
      return { roundId, status: ROUND_STATUSES.SETTLED, alreadySettled: true };
    }
    if (normalizeRoundStatus(row.status) !== ROUND_STATUSES.APPROVED) return null;
    if (!row.winnerId || !row.winnerName || !row.winningSerial || !row.approvedAt) {
      throw new Error(`Round ${roundId} is missing approved winner data`);
    }
    if (
      row.capacity !== POOL_CAPACITY ||
      row.sold !== POOL_CAPACITY ||
      Number(row.prize) !== PRIZE ||
      Number(row.treasuryContribution) !== TREASURY_CONTRIBUTION ||
      Number(row.adminGrossRevenue) !== ADMIN_GROSS_REVENUE
    ) {
      throw new Error(`Round ${roundId} requires accounting reconciliation before settlement`);
    }
    const roundTickets = await tx
      .select({ serial: tickets.serial, userId: tickets.userId })
      .from(tickets)
      .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
      .orderBy(tickets.id);
    if (roundTickets.length !== POOL_CAPACITY) {
      throw new Error(`Round ${roundId} does not contain exactly ${POOL_CAPACITY} tickets`);
    }
    if (!verifyStoredDraw(row, roundTickets)) throw new Error(`Round ${roundId} winner result does not verify`);
    const [ticketSales] = await tx
      .select({ amount: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
      .from(ledger)
      .where(and(eq(ledger.type, "ticket_buy"), eq(ledger.roundId, roundId)));
    if (Number(ticketSales?.amount ?? 0) !== -TOTAL_TICKET_REVENUE) {
      throw new Error(`Round ${roundId} ticket sales do not reconcile to $${TOTAL_TICKET_REVENUE}`);
    }
    const priorFee = (await tx.select().from(feeTransfers).where(eq(feeTransfers.roundId, roundId)).limit(1))[0];
    if (priorFee) {
      throw new Error(`Round ${roundId} has a pre-existing fee record requiring reconciliation`);
    }

    const winner = (await tx.select().from(users).where(eq(users.id, row.winnerId)).limit(1))[0];
    if (!winner) throw new Error(`Round ${roundId} winner account is missing`);
    const prize = PRIZE;
    const treasuryContribution = TREASURY_CONTRIBUTION;
    const adminGrossRevenue = ADMIN_GROSS_REVENUE;
    if (!config.adminWallet) throw new Error("ADMIN_WALLET must be configured before settlement");
    const vaultRow = (await tx.select().from(vault).limit(1).for("update"))[0];
    if (!vaultRow) throw new Error("Vault must be initialized explicitly before settlement");

    await tx.update(users).set({ balance: sql`${users.balance} + ${prize}` }).where(eq(users.id, winner.id));
    await tx.update(vault).set({
      balance: sql`${vault.balance} + ${treasuryContribution}`,
      totalFees: sql`${vault.totalFees} + ${treasuryContribution}`,
      adminEarnings: sql`${vault.adminEarnings} + ${adminGrossRevenue}`,
      adminWallet: config.adminWallet,
      totalPaid: sql`${vault.totalPaid} + ${prize}`,
      roundsCompleted: sql`${vault.roundsCompleted} + 1`,
      updatedAt: new Date(),
    });
    await recordVaultSnapshot(tx, "settlement", treasuryContribution, roundId);
    const accountingEntries = getRoundAccountingEntries({
      ticketRevenue: TOTAL_TICKET_REVENUE,
      prize,
      treasury: treasuryContribution,
      adminRevenue: adminGrossRevenue,
    });
    await tx.insert(ledger).values([
      {
        userId: null,
        username: "vault",
        type: "vault_treasury_contribution",
        amount: String(treasuryContribution),
        note: `Treasury vault contribution for round ${roundId}`,
        account: "vault_balance",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:vault-contribution`,
      },
      {
        userId: null,
        username: "admin",
        type: "admin_revenue",
        amount: String(adminGrossRevenue),
        note: `Admin gross revenue for round ${roundId}`,
        account: "admin_balance",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:admin-balance`,
      },
      {
        userId: winner.id,
        username: winner.username,
        type: "prize",
        amount: String(prize),
        note: `Settled winner payout for round ${roundId}`,
        account: "user",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:winner-payout`,
      },
      {
        userId: null,
        username: "accounting",
        type: accountingEntries[0].type,
        amount: String(accountingEntries[0].amount),
        note: `Ticket revenue for round ${roundId}`,
        account: "accounting",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:ticket-revenue`,
      },
      {
        userId: null,
        username: "accounting",
        type: accountingEntries[1].type,
        amount: String(accountingEntries[1].amount),
        note: `Prize allocation for round ${roundId}`,
        account: "accounting",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:prize-allocation`,
      },
      {
        userId: null,
        username: "accounting",
        type: accountingEntries[2].type,
        amount: String(accountingEntries[2].amount),
        note: `Treasury contribution for round ${roundId}`,
        account: "accounting",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:treasury`,
      },
      {
        userId: null,
        username: "accounting",
        type: accountingEntries[3].type,
        amount: String(accountingEntries[3].amount),
        note: `Admin gross revenue for round ${roundId}`,
        account: "accounting",
        roundId,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:admin-revenue`,
      },
    ]);
    await tx.insert(feeTransfers).values({
      roundId,
      amount: String(treasuryContribution),
      adminWallet: config.adminWallet,
      status: "accrued",
    });
    await tx.update(rounds).set({ status: ROUND_STATUSES.SETTLED, settledAt: new Date(), feeStatus: "accrued" }).where(eq(rounds.id, roundId));
    await tx.insert(adminAuditLog).values({
      actor,
      action: "round.settle",
      entity: "round",
      entityId: roundId,
      details: { ticketRevenue: TOTAL_TICKET_REVENUE, prize, treasuryContribution, adminGrossRevenue },
    });
    return { roundId, status: "SETTLED" };
  });
}

/** Public paginated draw history for the transparent winners table. */
export async function getDrawHistory(limit = 20, offset = 0) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const safeOffset = Math.max(0, Math.floor(offset) || 0);
  const [total, rows] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(rounds)
      .where(and(
        inArray(rounds.status, SETTLED_ROUND_STATUSES),
        isNotNull(rounds.winnerId),
        isNotNull(rounds.winningSerial),
        isNotNull(rounds.drawnAt),
        isNotNull(rounds.approvedAt),
        isNotNull(rounds.settledAt),
      )),
    db
      .select({ round: rounds, displayName: users.displayName, username: users.username })
      .from(rounds)
      .leftJoin(users, eq(users.id, rounds.winnerId))
      .where(and(
        inArray(rounds.status, SETTLED_ROUND_STATUSES),
        isNotNull(rounds.winnerId),
        isNotNull(rounds.winningSerial),
        isNotNull(rounds.drawnAt),
        isNotNull(rounds.approvedAt),
        isNotNull(rounds.settledAt),
      ))
      .orderBy(desc(rounds.id))
      .limit(safeLimit)
      .offset(safeOffset),
  ]);
  return {
    total: total[0]?.c ?? 0,
    limit: safeLimit,
    offset: safeOffset,
    draws: rows.map(({ round: w, displayName, username }) => ({
      roundId: w.id,
      winnerName: displayName ?? username ?? "Unknown User",
      winningSerial: w.winningSerial ?? "—",
      prize: Number(w.prize),
      fee: Number(w.fee),
      capacity: w.capacity,
      sold: w.sold,
      drawnAt: w.drawnAt ? new Date(w.drawnAt).toISOString() : null,
      openedAt: w.openedAt ? new Date(w.openedAt).toISOString() : null,
      seedHash: w.seedHash,
      serverSeed: w.serverSeed,
      feeStatus: w.feeStatus ?? "unverified",
      feeTxHash: (w as { feeTxHash?: string | null }).feeTxHash ?? null,
    })),
  };
}

export async function buyTickets(userId: number, requested: number) {
  const count = Math.min(10, Math.max(1, Math.floor(requested) || 1));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424243)`);
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    assertCanPlay(me);

    const round = (
      await tx
        .select()
        .from(rounds)
        .where(inArray(rounds.status, [ROUND_STATUSES.OPEN, "open"]))
        .orderBy(desc(rounds.id))
        .limit(1)
        .for("update")
    )[0];
    if (!round) throw new UserError("noActiveRound", 400);

    const [sold] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.roundId, round.id), eq(tickets.kind, "gold")));
    const currentSold = sold?.count ?? 0;
    const take = getTicketPurchaseCount(round.capacity, currentSold, count);
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
    const newSold = currentSold + take;
    await tx.update(rounds).set({
      sold: newSold,
      status: newSold === round.capacity ? ROUND_STATUSES.FULL : ROUND_STATUSES.OPEN,
    }).where(eq(rounds.id, round.id));
    await tx.update(vault).set({ ticketsSold: sql`${vault.ticketsSold} + ${take}`, updatedAt: new Date() });
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "ticket_buy",
      amount: String(-cost),
      note: `${take} golden tickets · round ${round.id}`,
      account: "user",
      roundId: round.id,
      reference: randomUUID(),
      transactionKey: `ticket-purchase:${randomUUID()}`,
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
          account: "user",
          reference: randomUUID(),
        });
      }
    }

    return { serials: created.map((t) => t.serial), roundId: round.id, draw: null };
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
    const me = (await tx.select().from(users).where(eq(users.id, dep.userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    if (dep.provider !== "demo") {
      const limit = effectiveLimit(me);
      if (limit !== null) {
        const [totals] = await tx
          .select({ total: sql<string>`coalesce(sum(${deposits.amountUsd}), 0)` })
          .from(deposits)
          .where(
            and(
              eq(deposits.userId, dep.userId),
              gte(deposits.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
              inArray(deposits.status, ["waiting", "confirming", "confirmed", "sending", "partially_paid", "finished"]),
              sql`${deposits.id} <> ${dep.id}`,
            ),
          );
        if (Number(totals?.total ?? 0) + amount > limit) {
          throw new UserError("depositLimit", 403, { limit: usd(limit) });
        }
      }
    }
    await tx
      .update(deposits)
      .set({ credited: true, status, updatedAt: new Date() })
      .where(eq(deposits.id, dep.id));

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
      account: "user",
      reference: randomUUID(),
      transactionKey: `deposit:${dep.id}:credit`,
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
          account: "user",
          reference: randomUUID(),
          transactionKey: `deposit:${dep.id}:referral-user:${ref.id}`,
        });
        await tx.insert(ledger).values({
          userId: null,
          username: "vault",
          type: "vault_referral_debit",
          amount: String(-bonus),
          note: `Referral bonus to ${ref.username}`,
          account: "vault_balance",
          reference: randomUUID(),
          transactionKey: `deposit:${dep.id}:referral:${ref.id}`,
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
      account: "user",
      reference: randomUUID(),
      transactionKey: `withdrawal:${w.id}:request`,
    });
    return w;
  });
}

export async function processWithdrawal(
  id: number,
  action: "paid" | "rejected",
  txHash?: string,
  note?: string,
  actor = "admin",
) {
  let verifiedTxHash: string | null = null;
  if (action === "paid") {
    const clean = txHash?.trim().toLowerCase() ?? "";
    if (!/^[0-9a-f]{64}$/.test(clean)) throw new UserError("txMismatch");
    const pending = (await db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1))[0];
    if (!pending) throw new UserError("wdNotFound", 404);
    if (pending.expectedTxId !== clean) throw new UserError("txMismatch");
    const chain = await lookupUsdtTransfers(clean);
    const matchingUnits = chain.status === "confirmed"
      ? chain.transfers.filter((transfer) => transfer.to === pending.address).reduce((sum, transfer) => sum + transfer.units, BigInt(0))
      : BigInt(0);
    if (matchingUnits !== toUnits(Number(pending.amount))) throw new UserError("txMismatch");
    verifiedTxHash = clean;
  }
  return db.transaction(async (tx) => {
    const w = (await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).for("update"))[0];
    if (!w) throw new UserError("wdNotFound", 404);
    if (w.status !== "pending") throw new UserError("wdProcessed");
    await tx
      .update(withdrawals)
      .set({ status: action, txHash: verifiedTxHash, note: note || null, processedAt: new Date() })
      .where(eq(withdrawals.id, id));
    if (action === "rejected") {
      await tx.update(users).set({ balance: sql`${users.balance} + ${w.amount}` }).where(eq(users.id, w.userId));
      await tx.insert(ledger).values({
        userId: w.userId,
        username: w.username,
        type: "withdraw_refund",
        amount: String(w.amount),
        note: `Withdrawal refund #${w.id}`,
        account: "user",
        reference: randomUUID(),
        transactionKey: `withdrawal:${w.id}:refund`,
      });
    } else {
      await tx.insert(ledger).values({
        userId: null,
        username: w.username,
        type: "withdraw_paid",
        amount: String(-Number(w.amount)),
        note: `Verified withdrawal #${w.id} · tx ${verifiedTxHash}`,
        account: "withdrawal_settlement",
        reference: randomUUID(),
        transactionKey: `withdrawal:${w.id}:paid`,
      });
    }
    await tx.insert(adminAuditLog).values({
      actor,
      action: action === "paid" ? "withdrawal.pay" : "withdrawal.reject",
      entity: "withdrawal",
      entityId: w.id,
      details: { status: action, txHash: verifiedTxHash, note: note ?? null },
    });
    const u = (await tx.select().from(users).where(eq(users.id, w.userId)).limit(1))[0];
    return { withdrawal: { ...w, status: action }, telegramId: u?.telegramId ?? null, locale: u?.locale ?? "en" };
  });
}

/* ------------------------------------------------------------------ state */

export async function getState() {
  const me = await getSessionUser();
  const region = regionStatus(await headers());

  const round = await ensureOpenRound();
  const v = (await db.select().from(vault).limit(1))[0];
  const settledRoundEntry = sql`exists (
    select 1 from ${rounds}
    where ${rounds.id} = ${ledger.roundId}
      and ${rounds.status} in (${ROUND_STATUSES.SETTLED}, 'settled')
      and ${rounds.winnerId} is not null
      and ${rounds.winningSerial} is not null
      and ${rounds.approvedAt} is not null
      and ${rounds.settledAt} is not null
  )`;
  const [financial] = await db
    .select({
      balance: sql<string>`coalesce(sum(case when ${ledger.account} = 'vault_balance' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then ${ledger.amount} else 0 end), 0)`,
      initialCapital: sql<string>`coalesce(sum(case when ${ledger.account} = 'vault_balance' and ${ledger.type} = 'vault_seed' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then ${ledger.amount} else 0 end), 0)`,
      totalFees: sql<string>`coalesce(sum(case when ${ledger.account} = 'accounting' and ${ledger.type} = 'treasury_contribution' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null and ${settledRoundEntry} then ${ledger.amount} else 0 end), 0)`,
      totalPaid: sql<string>`coalesce(sum(case when ${ledger.account} = 'accounting' and ${ledger.type} = 'prize_allocation' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null and ${settledRoundEntry} then ${ledger.amount} else 0 end), 0)`,
      adminEarnings: sql<string>`coalesce(sum(case when ${ledger.account} = 'accounting' and ${ledger.type} = 'admin_gross_revenue' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null and ${settledRoundEntry} then ${ledger.amount} else 0 end), 0)`,
      treasuryPaid: sql<string>`coalesce(-sum(case when ${ledger.account} = 'treasury_transfer' and ${ledger.type} = 'treasury_transfer' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then ${ledger.amount} else 0 end), 0)`,
      adminPaid: sql<string>`coalesce(-sum(case when ${ledger.account} = 'admin_transfer' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then ${ledger.amount} else 0 end), 0)`,
      roundsCompleted: sql<number>`count(distinct case when ${ledger.account} = 'accounting' and ${ledger.type} = 'ticket_revenue' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null and ${settledRoundEntry} then ${ledger.roundId} end)::int`,
      hasVerifiedSeed: sql<number>`count(case when ${ledger.account} = 'vault_balance' and ${ledger.type} = 'vault_seed' and ${ledger.reference} is not null and ${ledger.transactionKey} is not null then 1 end)::int`,
      legacyFinancialEntries: sql<number>`count(case when ${ledger.type} in ('ticket_buy','ticket_refund','prize','ticket_revenue','prize_allocation','treasury_contribution','admin_gross_revenue','vault_seed','initial_capital','withdraw_paid') and (${ledger.account} is null or ${ledger.reference} is null or ${ledger.transactionKey} is null) then 1 end)::int`,
    })
    .from(ledger);

  const recent = await db
    .select({ entry: ledger, username: users.username })
    .from(ledger)
    .innerJoin(rounds, eq(rounds.id, ledger.roundId))
    .leftJoin(users, eq(users.id, ledger.userId))
    .where(and(
      inArray(ledger.type, ["ticket_buy", "prize"]),
      eq(ledger.account, "user"),
      isNotNull(ledger.reference),
      isNotNull(ledger.transactionKey),
      inArray(rounds.status, SALES_ELIGIBLE_ROUND_STATUSES),
    ))
    .orderBy(desc(ledger.id))
    .limit(10);
  // privacy: never expose full usernames of other players in the public feed
  const mask = (u: string | null) => (u ? (u.length <= 3 ? u[0] + "**" : u.slice(0, 3) + "***") : "Unknown User");

  const [roundTickets, winners, players, last24, feeQueue, ticketsSold] = await Promise.all([
    round
      ? db
          .select({ ticket: tickets, displayName: users.displayName, username: users.username })
          .from(tickets)
          .leftJoin(users, eq(users.id, tickets.userId))
          .where(eq(tickets.roundId, round.id))
          .orderBy(tickets.id)
      : Promise.resolve([]),
    db
      .select({ round: rounds, displayName: users.displayName, username: users.username })
      .from(rounds)
      .leftJoin(users, eq(users.id, rounds.winnerId))
      .where(and(
        inArray(rounds.status, SETTLED_ROUND_STATUSES),
        isNotNull(rounds.winnerId),
        isNotNull(rounds.winningSerial),
        isNotNull(rounds.drawnAt),
        isNotNull(rounds.approvedAt),
        isNotNull(rounds.settledAt),
      ))
      .orderBy(desc(rounds.id))
      .limit(20),
    db.select({ c: sql<number>`count(*)::int` }).from(users),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tickets)
      .innerJoin(rounds, eq(tickets.roundId, rounds.id))
      .where(and(
        gte(tickets.createdAt, new Date(Date.now() - 86400000)),
        inArray(rounds.status, SALES_ELIGIBLE_ROUND_STATUSES),
      )),
    db
      .select({ c: sql<number>`count(*)::int`, s: sql<string>`coalesce(sum(${feeTransfers.amount}),0)` })
      .from(feeTransfers)
      .innerJoin(
        ledger,
        and(
          eq(ledger.roundId, feeTransfers.roundId),
          eq(ledger.type, "treasury_contribution"),
          eq(ledger.account, "accounting"),
          isNotNull(ledger.reference),
          isNotNull(ledger.transactionKey),
        ),
      )
      .where(inArray(feeTransfers.status, ["accrued", "queued", "processing"])),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(tickets)
      .innerJoin(rounds, eq(tickets.roundId, rounds.id))
      .where(inArray(rounds.status, SALES_ELIGIBLE_ROUND_STATUSES)),
  ]);

  if (round && (roundTickets.length !== round.sold || round.sold > round.capacity)) {
    throw new Error(`Round ${round.id} ticket records do not match its stored capacity data`);
  }

  const board = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      tickets: sql<number>`count(${tickets.id})::int`,
    })
    .from(users)
    .innerJoin(tickets, eq(tickets.userId, users.id))
    .innerJoin(rounds, eq(rounds.id, tickets.roundId))
    .where(inArray(rounds.status, SALES_ELIGIBLE_ROUND_STATUSES))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${tickets.id})`))
    .limit(6);
  const winnings = board.length
    ? await db
        .select({ userId: ledger.userId, total: sql<string>`coalesce(sum(${ledger.amount}),0)` })
        .from(ledger)
        .innerJoin(rounds, eq(rounds.id, ledger.roundId))
        .where(and(
          eq(ledger.type, "prize"),
          eq(ledger.account, "user"),
          isNotNull(ledger.reference),
          isNotNull(ledger.transactionKey),
          inArray(rounds.status, SETTLED_ROUND_STATUSES),
          inArray(ledger.userId, board.map((b) => b.id)),
        ))
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
          normalizeRoundStatus(ticketRound.status) === ROUND_STATUSES.REFUNDED
            ? "refunded"
            : normalizeRoundStatus(ticketRound.status) !== ROUND_STATUSES.SETTLED
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
      balance: Number(financial?.balance ?? 0),
      initialCapital: Number(financial?.initialCapital ?? 0),
      totalFees: Number(financial?.totalFees ?? 0),
      totalPaid: Number(financial?.totalPaid ?? 0),
      roundsCompleted: Number(financial?.roundsCompleted ?? 0),
      ticketsSold: Number(ticketsSold[0]?.c ?? 0),
      adminWallet: v?.adminWallet ?? config.adminWallet,
      adminEarnings: Number(financial?.adminEarnings ?? 0),
      adminPaid: Number(financial?.adminPaid ?? 0),
      treasuryPaid: Number(financial?.treasuryPaid ?? 0),
      ledgerStatus:
        Number(financial?.hasVerifiedSeed ?? 0) === 0 || Number(financial?.legacyFinancialEntries ?? 0) > 0
          ? "historical_reconciliation_required"
          : "verified",
      feePending: Number(feeQueue[0]?.s ?? 0),
      feePendingCount: feeQueue[0]?.c ?? 0,
    },
    round: round ? {
      id: round.id,
      status: normalizeRoundStatus(round.status),
      capacity: round.capacity,
      sold: round.sold,
      remaining: Math.max(0, round.capacity - round.sold),
      prize: Number(round.prize),
      fee: Number(round.fee),
      treasuryContribution: round.treasuryContribution === null ? null : Number(round.treasuryContribution),
      adminGrossRevenue: round.adminGrossRevenue === null ? null : Number(round.adminGrossRevenue),
      seedHash: round.seedHash,
      tickets: roundTickets.map(({ ticket, displayName, username }) => ({
        id: ticket.id,
        serial: ticket.serial,
        username: displayName ?? username ?? "Unknown User",
        kind: ticket.kind,
        mine: me ? ticket.userId === me.id : false,
      })),
    } : null,
    winners: winners.map(({ round: w, displayName, username }) => ({
      roundId: w.id,
      winnerName: displayName ?? username ?? "Unknown User",
      winningSerial: w.winningSerial ?? "—",
      prize: Number(w.prize),
      fee: Number(w.fee),
      capacity: w.capacity,
      sold: w.sold,
      drawnAt: w.drawnAt ? new Date(w.drawnAt).toISOString() : null,
      openedAt: w.openedAt ? new Date(w.openedAt).toISOString() : null,
      seedHash: w.seedHash,
      serverSeed: w.serverSeed,
      feeStatus: w.feeStatus ?? "unverified",
      feeTxHash: w.feeTxHash ?? null,
    })),
    leaderboard: board.map((b) => ({
      username: b.username,
      displayName: b.displayName,
      tickets: Number(b.tickets ?? 0),
      won: Number(winnings.find((x) => x.userId === b.id)?.total ?? 0),
    })),
    stats: { players: players[0]?.c ?? 0, ticketsLast24: last24[0]?.c ?? 0 },
    activity: recent.map(({ entry: r, username }) => ({
      id: r.id,
      type: r.type as "ticket_buy" | "prize",
      user: mask(username),
      amount: Math.abs(Number(r.amount)),
      at: new Date(r.createdAt).toISOString(),
    })),
    user,
  };
}
