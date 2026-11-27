import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  deposits,
  adminAuditLog,
  drawCommitments,
  drawReveals,
  feeTransfers,
  refundsAndRollovers,
  roundSettlements,
  vaultSnapshots,
  ledger,
  rounds,
  ticketTiers,
  tickets,
  treasuryTransactions,
  users,
  vault,
  wheelSpins,
  withdrawals,
  type Round,
  type Ticket,
  type User,
} from "@/db/schema";
import { config, publicConfig } from "@/lib/config";
import { isTicketSerialCollision, makeTicketSerial } from "@/lib/ticketSerial";
import { appendAdminAuditEvent, writePhase2DrawEvidence, writePhase2SettlementProof } from "@/lib/phase2Runtime";
import { evaluatePhase2Refund } from "@/lib/phase2Policy";
import { WHEEL_SECTORS } from "@/lib/wheel";
import type { Dict } from "@/i18n/dictionaries/en";
import { regionStatus } from "@/lib/geo";
import { headers } from "next/headers";
const STORE_SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STORE_SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test((addr || "").trim());
}

function toSolanaUsdcUnits(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) return BigInt(0);
  return BigInt(Math.round(amount * 1_000_000));
}

async function lookupSolanaUsdcTransfers(
  signature: string
): Promise<{ status: "confirmed" | "pending" | "not_found"; transfers: Array<{ from: string; to: string; units: bigint }> }> {
  const sig = (signature || "").trim();
  if (!sig) return { status: "not_found", transfers: [] };

  try {
    const res = await fetch(STORE_SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getParsedTransaction",
        params: [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
      }),
    });
    if (!res.ok) return { status: "pending", transfers: [] };
    const json = (await res.json()) as {
      result?: {
        meta?: {
          err?: unknown;
          preTokenBalances?: Array<{
            accountIndex: number;
            mint?: string;
            owner?: string;
            uiTokenAmount?: { amount?: string };
          }>;
          postTokenBalances?: Array<{
            accountIndex: number;
            mint?: string;
            owner?: string;
            uiTokenAmount?: { amount?: string };
          }>;
        };
        transaction?: {
          message?: {
            accountKeys?: Array<string | { pubkey?: string }>;
          };
        };
      } | null;
    };

    if (!json.result) return { status: "pending", transfers: [] };
    if (json.result.meta && json.result.meta.err) return { status: "not_found", transfers: [] };

    const rawKeys =
      (json.result.transaction &&
        json.result.transaction.message &&
        json.result.transaction.message.accountKeys) ||
      [];
    const keys = rawKeys.map((k) =>
      typeof k === "string" ? k : k && k.pubkey ? String(k.pubkey) : ""
    );

    const map = new Map<string, { owner: string; pre: bigint; post: bigint }>();
    for (const b of (json.result.meta && json.result.meta.preTokenBalances) || []) {
      if (b.mint !== STORE_SOLANA_USDC_MINT) continue;
      const owner = b.owner || keys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const amt = b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      map.set(key, { owner, pre: BigInt(amt), post: BigInt(0) });
    }
    for (const b of (json.result.meta && json.result.meta.postTokenBalances) || []) {
      if (b.mint !== STORE_SOLANA_USDC_MINT) continue;
      const owner = b.owner || keys[b.accountIndex] || "";
      const key = `${b.accountIndex}:${owner}`;
      const cur = map.get(key) || { owner, pre: BigInt(0), post: BigInt(0) };
      const amt = b.uiTokenAmount && b.uiTokenAmount.amount ? b.uiTokenAmount.amount : "0";
      cur.post = BigInt(amt);
      map.set(key, cur);
    }

    const transfers: Array<{ from: string; to: string; units: bigint }> = [];
    let sender = keys[0] || "";
    for (const entry of Array.from(map.values())) {
      const delta = entry.post - entry.pre;
      if (delta < BigInt(0) && entry.owner) sender = entry.owner;
    }
    for (const entry of Array.from(map.values())) {
      const delta = entry.post - entry.pre;
      if (delta > BigInt(0) && entry.owner) {
        transfers.push({ from: sender, to: entry.owner, units: delta });
      }
    }

    return { status: "confirmed", transfers };
  } catch {
    return { status: "pending", transfers: [] };
  }
}import { getRoundAccountingEntries, getTicketPurchaseCount } from "@/lib/roundAccounting";
import { effectiveLimit } from "@/lib/responsibleGaming";
import {
  getSolanaConfig,
  isValidSolanaAddress,
  isValidSolanaTxSignature,
} from "@/lib/solana";
import { roundMoney } from "@/lib/tierAccounting";
import { deriveTierAmounts, tierLockKey, winnerAmountsForTier } from "@/lib/tierMath";

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

type TierConfig = {
  id: number;
  code: string;
  name: string;
  priceUsd: number;
  capacity: number;
  drawDurationMinutes: number;
  minimumParticipants: number;
  maximumParticipants: number | null;
  prizePercentage: number;
  treasuryPercentage: number;
  adminPercentage: number;
  amounts: ReturnType<typeof deriveTierAmounts>;
  snapshot: Record<string, unknown>;
};

function amountsForTicketCount(tier: TierConfig, ticketCount: number) {
  if (!(ticketCount > 0)) throw new Error("Ticket count must be positive");
  return deriveTierAmounts({
    priceUsd: tier.priceUsd,
    capacity: ticketCount,
    prizePercentage: tier.prizePercentage,
    treasuryPercentage: tier.treasuryPercentage,
    adminPercentage: tier.adminPercentage,
  });
}

function tierConfigFromRow(row: typeof ticketTiers.$inferSelect): TierConfig {
  const priceUsd = Number(row.priceUsd);
  const prizePercentage = Number(row.prizePercentage);
  const treasuryPercentage = Number(row.treasuryPercentage);
  const adminPercentage = Number(row.adminPercentage);
  const amounts = deriveTierAmounts({
    priceUsd,
    capacity: row.ticketCapacity,
    prizePercentage,
    treasuryPercentage,
    adminPercentage,
  });
  const rules =
    row.rules && typeof row.rules === "object" && !Array.isArray(row.rules)
      ? (row.rules as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceUsd,
    capacity: row.ticketCapacity,
    drawDurationMinutes: row.drawDurationMinutes,
    minimumParticipants: row.minimumParticipants,
    maximumParticipants: row.maximumParticipants,
    prizePercentage,
    treasuryPercentage,
    adminPercentage,
    amounts,
    snapshot: {
      code: row.code,
      name: row.name,
      priceUsd,
      capacity: row.ticketCapacity,
      drawDurationMinutes: row.drawDurationMinutes,
      prizePercentage,
      treasuryPercentage,
      adminPercentage,
      prize: amounts.prize,
      treasury: amounts.treasury,
      admin: amounts.admin,
      minimumParticipants: row.minimumParticipants,
      maximumParticipants: row.maximumParticipants,
      rules,
    },
  };
}

async function resolveTierConfig(q: Q, selector?: string | number): Promise<TierConfig> {
  const condition =
    selector === undefined
      ? eq(ticketTiers.status, "ACTIVE")
      : and(
          eq(ticketTiers.status, "ACTIVE"),
          typeof selector === "number" ? eq(ticketTiers.id, selector) : eq(ticketTiers.code, selector),
        );
  const row = (
    await q
      .select()
      .from(ticketTiers)
      .where(condition)
      .orderBy(asc(ticketTiers.displayOrder), asc(ticketTiers.id))
      .limit(1)
  )[0];
  if (!row) throw new Error("No active ticket tier is configured");
  return tierConfigFromRow(row);
}

export async function listActiveTiers() {
  const rows = await db
    .select()
    .from(ticketTiers)
    .where(eq(ticketTiers.status, "ACTIVE"))
    .orderBy(asc(ticketTiers.displayOrder), asc(ticketTiers.id));
  return rows.map((row) => {
    const tier = tierConfigFromRow(row);
    return {
      id: tier.id,
      code: tier.code,
      name: tier.name,
      status: row.status,
      displayOrder: row.displayOrder,
      priceUsd: tier.priceUsd,
      capacity: tier.capacity,
      drawDurationMinutes: tier.drawDurationMinutes,
      prizePercentage: tier.prizePercentage,
      treasuryPercentage: tier.treasuryPercentage,
      adminPercentage: tier.adminPercentage,
      prize: tier.amounts.prize,
      winnerAmounts: winnerAmountsForTier({
        code: tier.code,
        prize: tier.amounts.prize,
        rules: (tier.snapshot.rules ?? null) as Record<string, unknown> | null,
      }),
      treasury: tier.amounts.treasury,
      admin: tier.amounts.admin,
      minimumParticipants: tier.minimumParticipants,
      maximumParticipants: tier.maximumParticipants,
      rules: (tier.snapshot.rules ?? {}) as Record<string, unknown>,
    };
  });
}

function tierConfigFromRound(row: Round): TierConfig {
  const snapshot =
    row.tierSnapshot && typeof row.tierSnapshot === "object" && !Array.isArray(row.tierSnapshot)
      ? (row.tierSnapshot as Record<string, unknown>)
      : {};
  const priceUsd = Number(snapshot.priceUsd ?? TICKET_PRICE);
  const capacity = Number(snapshot.capacity ?? row.capacity ?? POOL_CAPACITY);
  const prizePercentage = Number(snapshot.prizePercentage ?? 75);
  const treasuryPercentage = Number(snapshot.treasuryPercentage ?? 15);
  const adminPercentage = Number(snapshot.adminPercentage ?? 10);

  return {
    id: row.tierId ?? 1,
    code: String(snapshot.code ?? "usd_1"),
    name: String(snapshot.name ?? "$1 Tier"),
    priceUsd,
    capacity,
    drawDurationMinutes: Number(snapshot.drawDurationMinutes ?? 1440),
    minimumParticipants: Number(snapshot.minimumParticipants ?? 1),
    maximumParticipants: snapshot.maximumParticipants === null ? null : Number(snapshot.maximumParticipants ?? capacity),
    prizePercentage,
    treasuryPercentage,
    adminPercentage,
    amounts: deriveTierAmounts({
      priceUsd,
      capacity,
      prizePercentage,
      treasuryPercentage,
      adminPercentage,
    }),
    snapshot,
  };
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
  pool: Pick<Ticket, "ticketSerial" | "userId">[],
  expectedTicketCount: number,
) {
  if (!row.serverSeed || !row.seedHash || !row.winnerId || !row.winningSerial || pool.length !== expectedTicketCount) return false;
  if (createHash("sha256").update(row.serverSeed).digest("hex") !== row.seedHash) return false;
  const winner = pool[fairIndex(row.serverSeed, row.id, pool.map((ticket) => ticket.ticketSerial))];
  return winner?.ticketSerial === row.winningSerial && winner.userId === row.winnerId;
}

async function openNewRound(q: Q, tier: TierConfig) {
  const { serverSeed, seedHash } = newSeed();
  const created = (
    await q
      .insert(rounds)
      .values({
        status: ROUND_STATUSES.OPEN,
        capacity: tier.capacity,
        sold: 0,
        prize: String(tier.amounts.prize),
        fee: String(tier.amounts.fee),
        treasuryContribution: String(tier.amounts.treasury),
        adminGrossRevenue: String(tier.amounts.admin),
        tierId: tier.id,
        tierSnapshot: tier.snapshot,
        closesAt: new Date(Date.now() + tier.drawDurationMinutes * 60_000),
        minimumParticipants: tier.minimumParticipants,
        maximumParticipants: tier.maximumParticipants,
        serverSeed,
        seedHash,
      })
      .returning()
  )[0];
  await q.insert(drawCommitments).values({
    roundId: created.id,
    tierId: tier.id,
    serverSeedHash: seedHash,
    drawNonce: 0,
    status: "COMMITTED",
  });
  return created;
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
    await appendAdminAuditEvent(tx, {
      actor,
      action: "treasury.initialize",
      subject: `vault:${created.id}`,
      metadata: { initialCapital },
    });
    return created;
  });
}

export async function openAdminRound(actor: string, tierSelector?: string | number) {
  return db.transaction(async (tx) => {
    const tier = await resolveTierConfig(tx, tierSelector);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);
    const active = await tx
      .select({ id: rounds.id })
      .from(rounds)
      .where(and(
        inArray(rounds.status, ["OPEN", "FULL", "AWAITING_ADMIN_APPROVAL", "APPROVED"]),
        eq(rounds.tierId, tier.id),
      ))
      .limit(1);
    if (active.length) throw new UserError("roundFull", 409);
    const v = (await tx.select({ id: vault.id }).from(vault).limit(1))[0];
    if (!v) throw new Error("Vault must be initialized explicitly before opening a round");
    const round = await openNewRound(tx, tier);
    await tx.insert(adminAuditLog).values({
      actor,
      action: "round.open",
      entity: "round",
      entityId: round.id,
      details: { status: ROUND_STATUSES.OPEN, tierCode: tier.code },
    });
    await appendAdminAuditEvent(tx, {
      actor,
      action: "round.open",
      subject: `round:${round.id}`,
      metadata: { status: ROUND_STATUSES.OPEN, tierCode: tier.code },
    });
    return round;
  });
}

export async function findOpenRound(tierSelector?: string | number) {
  const tier = await resolveTierConfig(db, tierSelector);
  return (
    (
      await db
        .select()
        .from(rounds)
        .where(and(
          inArray(rounds.status, [ROUND_STATUSES.OPEN, "open"]),
          eq(rounds.tierId, tier.id),
        ))
        .orderBy(desc(rounds.id))
        .limit(1)
    )[0] ?? null
  );
}

export async function ensureOpenRound(tierSelector?: string | number) {
  return db.transaction(async (tx) => {
    const tier = await resolveTierConfig(tx, tierSelector);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);

    const open = (
      await tx
        .select()
        .from(rounds)
        .where(and(
          inArray(rounds.status, [ROUND_STATUSES.OPEN, "open"]),
          eq(rounds.tierId, tier.id),
        ))
        .orderBy(desc(rounds.id))
        .limit(1)
        .for("update")
    )[0];

    if (open && open.sold < open.capacity) return open;

    const v = (await tx.select({ id: vault.id }).from(vault).limit(1))[0];
    if (!v) return null;

    return openNewRound(tx, tier);
  });
}

/**
 * Closes a round that never filled and refunds every ticket at face value.
 * Idempotent: only acts on a still-open round with tickets.
 */
export async function refundRound(roundId: number) {
  return db.transaction(async (tx) => {
    const r = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
    if (!r || normalizeRoundStatus(r.status) !== ROUND_STATUSES.OPEN || r.sold === 0) return null;
    const tier = tierConfigFromRound(r);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);
    const list = await tx.select().from(tickets).where(eq(tickets.roundId, roundId));
    const isoDate = (value: Date | null | undefined) => (value ? value.toISOString() : null);
    const refundDecision = evaluatePhase2Refund({
      tier: tier.id,
      openedAt: r.openedAt.toISOString(),
      closedAt: isoDate(r.closesAt),
      settledAt: isoDate(r.settledAt),
      refundedAt: r.refundPolicy === "REFUND_100" ? isoDate(r.drawnAt) : null,
      rolledOverAt: r.rolloverToRoundId !== null ? isoDate(r.drawnAt) : null,
    });
    const perUser = new Map<number, { count: number; username: string }>();
    for (const t of list) {
      const cur = perUser.get(t.userId) ?? { count: 0, username: t.username };
      cur.count += 1;
      perUser.set(t.userId, cur);
    }
    for (const [userId, v] of perUser) {
      const amount = roundMoney(v.count * tier.priceUsd);
      await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
      await tx.insert(ledger).values({
        userId,
        username: v.username,
        type: "ticket_refund",
        amount: String(amount),
        note: `Refund: round ${roundId} expired (${v.count} tickets)`,
        account: "user",
        roundId,
        tierId: tier.id,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:refund:${userId}`,
      });
      await tx.insert(refundsAndRollovers).values({
        roundId,
        userId,
        policy: "REFUND_100",
        ticketIds: list.filter((ticket) => ticket.userId === userId).map((ticket) => ticket.id),
        amountUsd: amount.toFixed(2),
        ledgerEventId: `round:${roundId}:refund:${userId}`,
        status: refundDecision === "eligible" ? "COMPLETED" : "COMPLETED_EARLY",
      }).onConflictDoNothing();
    }
    await tx.update(rounds).set({ status: ROUND_STATUSES.REFUNDED, drawnAt: new Date() }).where(eq(rounds.id, roundId));
    await tx.update(vault).set({ ticketsSold: sql`greatest(${vault.ticketsSold} - ${r.sold}, 0)`, updatedAt: new Date() });
    return {
      tickets: list.length,
      priceUsd: tier.priceUsd,
      users: [...perUser.entries()].map(([id, v]) => ({ id, count: v.count })),
      phase2Decision: refundDecision,
    };
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
  const tier = tierConfigFromRound(row);
  if (!row.serverSeed || !row.seedHash || createHash("sha256").update(row.serverSeed).digest("hex") !== row.seedHash) {
    throw new Error(`Round ${roundId} has no verifiable committed seed`);
  }

  const pool = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
    .orderBy(tickets.id);

  const closed = Boolean(row.closesAt && Date.now() >= new Date(row.closesAt).getTime());
  const participantCount = new Set(pool.map((ticket) => ticket.userId)).size;
  const partialDraw = pool.length < row.capacity;
  if (partialDraw) {
    const eligible = closed && participantCount >= row.minimumParticipants && pool.length >= row.minimumParticipants;
    if (!eligible) {
      await tx.update(rounds).set({ sold: pool.length, status: ROUND_STATUSES.OPEN }).where(eq(rounds.id, roundId));
      return null;
    }
  } else if (pool.length !== row.capacity || row.capacity !== tier.capacity) {
    throw new Error(`Round ${roundId} does not meet the configured ticket capacity`);
  }

  if (row.sold !== pool.length) {
    await tx.update(rounds).set({ sold: pool.length, status: partialDraw ? ROUND_STATUSES.OPEN : "FULL" }).where(eq(rounds.id, roundId));
  }

  const amounts = amountsForTicketCount(tier, pool.length);
  const prize = amounts.prize;
  const revenue = amounts.totalPool;
  const treasuryContribution = amounts.treasury;
  const adminGrossRevenue = amounts.admin;
  const adminWallet = config.adminWallet;
  const winner = pool[fairIndex(row.serverSeed, roundId, pool.map((t) => t.ticketSerial))];
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
      winningSerial: winner.ticketSerial,
      drawnAt,
      prize: String(prize),
      fee: String(amounts.fee),
      treasuryContribution: String(treasuryContribution),
      adminGrossRevenue: String(adminGrossRevenue),
      feeStatus: "accrued",
    })
    .where(eq(rounds.id, roundId));

  await tx
    .insert(drawCommitments)
    .values({
      roundId,
      tierId: tier.id,
      serverSeedHash: row.seedHash,
      clientSeed: null,
      drawNonce: 0,
      status: "REVEALED",
      winnerTicketId: winner.id,
      winningSerial: winner.ticketSerial,
      revealedServerSeed: row.serverSeed,
      committedAt: row.openedAt ?? new Date(),
      revealedAt: drawnAt,
    })
    .onConflictDoUpdate({
      target: drawCommitments.roundId,
      set: {
        status: "REVEALED",
        winnerTicketId: winner.id,
        winningSerial: winner.ticketSerial,
        revealedServerSeed: row.serverSeed,
        revealedAt: drawnAt,
      },
    });

  await writePhase2DrawEvidence(tx, {
    roundId,
    serverSeed: row.serverSeed,
    live: config.live,
    winnerCount: Math.min(3, pool.length),
    tickets: pool.map((ticket) => ({
      id: ticket.id,
      userId: ticket.userId,
      ticketSerial: ticket.ticketSerial,
      tierId: row.tierId ?? tier.id,
    })),
  });

  return {
    winnerName,
    winnerTelegramId: winnerRow?.telegramId ?? null,
    winnerLocale: winnerRow?.locale ?? "en",
    winningSerial: winner.ticketSerial,
    prize,
    fee: amounts.fee,
    roundId,
    serverSeed: row.serverSeed,
    drawnAt: drawnAt.toISOString(),
    adminWallet,
    serials: pool.map((t) => t.ticketSerial),
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
      await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(r.tierId ?? 1)})`);
      return drawRound(tx, r.id, triggerUserId);
    });
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

export async function autoDrawExpiredRounds(triggerUserId = 0): Promise<DrawOutcome[]> {
  const open = await db
    .select()
    .from(rounds)
    .where(and(
      inArray(rounds.status, [ROUND_STATUSES.OPEN, ROUND_STATUSES.FULL, "open", "full"]),
      isNotNull(rounds.closesAt),
      lt(rounds.closesAt, new Date()),
    ))
    .orderBy(asc(rounds.id));
  const outcomes: DrawOutcome[] = [];
  for (const r of open) {
    if (!r.serverSeed || !r.seedHash) continue;
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(r.tierId ?? 1)})`);
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
    const tier = tierConfigFromRound(row);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);
    const current = normalizeRoundStatus(row.status);
    if (approved && current === ROUND_STATUSES.APPROVED) return { roundId, approved, status: current, alreadyApplied: true };
    if (!approved && current === ROUND_STATUSES.REFUNDED) return { roundId, approved, status: current, alreadyApplied: true };
    if (current !== ROUND_STATUSES.AWAITING_ADMIN_APPROVAL) return null;
    if (approved) {
      const pool = await tx
        .select({ ticketSerial: tickets.ticketSerial, userId: tickets.userId })
        .from(tickets)
        .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
        .orderBy(tickets.id);
      if (!row.winnerId || !row.winningSerial || row.sold !== pool.length || row.capacity !== tier.capacity) return null;
      if (pool.length < row.capacity) {
        const closed = Boolean(row.closesAt && Date.now() >= new Date(row.closesAt).getTime());
        if (!closed || new Set(pool.map((ticket) => ticket.userId)).size < row.minimumParticipants) return null;
      }
      if (!verifyStoredDraw(row, pool, pool.length)) return null;
    }

    const next = approved ? ROUND_STATUSES.APPROVED : ROUND_STATUSES.REFUNDED;
    let refundedTickets = 0;
    if (!approved) {
      const list = await tx.select().from(tickets).where(eq(tickets.roundId, roundId));
      refundedTickets = list.length;
      await tx
        .update(tickets)
        .set({ status: "refunded" })
        .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")));
      const perUser = new Map<number, { count: number; username: string }>();
      for (const ticket of list) {
        const cur = perUser.get(ticket.userId) ?? { count: 0, username: ticket.username };
        cur.count += 1;
        perUser.set(ticket.userId, cur);
      }
      for (const [userId, value] of perUser) {
        const amount = roundMoney(value.count * tier.priceUsd);
        await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
        await tx.insert(ledger).values({
          userId,
          username: value.username,
          type: "ticket_refund",
          amount: String(amount),
          note: `Refund: round ${roundId} rejected by automated BETX verification`,
          account: "user",
          roundId,
          tierId: tier.id,
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
    await appendAdminAuditEvent(tx, {
      actor,
      action: approved ? "round.approve" : "round.reject_and_refund",
      subject: `round:${roundId}`,
      metadata: { from: current, to: next, refundedTickets },
    });
    return { roundId, approved, status: next };
  });
}

export async function settleApprovedRound(roundId: number, actor: string) {
  return db.transaction(async (tx) => {
    const row = (await tx.select().from(rounds).where(eq(rounds.id, roundId)).for("update"))[0];
    if (!row) return null;
    const tier = tierConfigFromRound(row);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);
    if (normalizeRoundStatus(row.status) === ROUND_STATUSES.SETTLED) {
      return { roundId, status: ROUND_STATUSES.SETTLED, alreadySettled: true };
    }
    if (normalizeRoundStatus(row.status) !== ROUND_STATUSES.APPROVED) return null;
    if (!row.winnerId || !row.winnerName || !row.winningSerial || !row.approvedAt) {
      throw new Error(`Round ${roundId} is missing approved winner data`);
    }
    const roundTickets = await tx
      .select({ ticketSerial: tickets.ticketSerial, userId: tickets.userId })
      .from(tickets)
      .where(and(eq(tickets.roundId, roundId), eq(tickets.kind, "gold")))
      .orderBy(tickets.id);
    if (row.sold !== roundTickets.length) {
      throw new Error(`Round ${roundId} ticket count does not match its recorded sales`);
    }
    if (new Set(roundTickets.map((ticket) => ticket.userId)).size < row.minimumParticipants) {
      throw new Error(`Round ${roundId} does not meet its minimum participant requirement`);
    }
    if (row.capacity !== tier.capacity) {
      throw new Error(`Round ${roundId} requires accounting reconciliation before settlement`);
    }
    const amounts = amountsForTicketCount(tier, roundTickets.length);
    const prize = amounts.prize;
    const treasuryContribution = amounts.treasury;
    const adminGrossRevenue = amounts.admin;
    if (
      roundMoney(Number(row.prize)) !== prize ||
      roundMoney(Number(row.fee)) !== amounts.fee ||
      roundMoney(Number(row.treasuryContribution ?? 0)) !== treasuryContribution ||
      roundMoney(Number(row.adminGrossRevenue ?? 0)) !== adminGrossRevenue
    ) {
      throw new Error(`Round ${roundId} requires accounting reconciliation before settlement`);
    }
    if (!verifyStoredDraw(row, roundTickets, roundTickets.length)) throw new Error(`Round ${roundId} winner result does not verify`);
    const [ticketSales] = await tx
      .select({ amount: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
      .from(ledger)
      .where(and(eq(ledger.type, "ticket_buy"), eq(ledger.roundId, roundId)));
    if (roundMoney(Number(ticketSales?.amount ?? 0)) !== -amounts.totalPool) {
      throw new Error(`Round ${roundId} ticket sales do not reconcile to $${amounts.totalPool.toFixed(2)}`);
    }
    const priorFee = (await tx.select().from(feeTransfers).where(eq(feeTransfers.roundId, roundId)).limit(1))[0];
    if (priorFee) {
      throw new Error(`Round ${roundId} has a pre-existing fee record requiring reconciliation`);
    }

    const winner = (await tx.select().from(users).where(eq(users.id, row.winnerId)).limit(1))[0];
    if (!winner) throw new Error(`Round ${roundId} winner account is missing`);
    const settlementReference = randomUUID();
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
      ticketRevenue: amounts.totalPool,
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
        tierId: tier.id,
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
        tierId: tier.id,
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
        tierId: tier.id,
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
        tierId: tier.id,
        reference: settlementReference,
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
        tierId: tier.id,
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
        tierId: tier.id,
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
        tierId: tier.id,
        reference: randomUUID(),
        transactionKey: `round:${roundId}:admin-revenue`,
      },
    ]);
    await tx.insert(roundSettlements).values({
      roundId,
      tierId: tier.id,
      totalPool: String(amounts.totalPool),
      winnerAmount: String(prize),
      treasuryAmount: String(treasuryContribution),
      adminAmount: String(adminGrossRevenue),
      ledgerReference: settlementReference,
      status: "PENDING",
    });
    await tx.insert(treasuryTransactions).values([
      {
        tierId: tier.id,
        roundId,
        direction: "OUT",
        category: "prize_reserve",
        amount: String(prize),
        status: "PENDING",
      },
      {
        tierId: tier.id,
        roundId,
        direction: "OUT",
        category: "treasury_transfer",
        amount: String(treasuryContribution),
        status: "PENDING",
      },
      {
        tierId: tier.id,
        roundId,
        direction: "OUT",
        category: "admin_transfer",
        amount: String(adminGrossRevenue),
        status: "PENDING",
      },
    ]);
    await tx.insert(feeTransfers).values({
      roundId,
      tierId: tier.id,
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
      details: {
        tierCode: tier.code,
        ticketRevenue: amounts.totalPool,
        prize,
        treasuryContribution,
        adminGrossRevenue,
      },
    });
    const chainEvent = await appendAdminAuditEvent(tx, {
      actor,
      action: "round.settle",
      subject: `round:${roundId}`,
      metadata: { tierCode: tier.code, ticketRevenue: amounts.totalPool, prize, treasuryContribution, adminGrossRevenue },
    });
    const reveal = (
      await tx
        .select({ proofPayload: drawReveals.proofPayload })
        .from(drawReveals)
        .where(eq(drawReveals.roundId, roundId))
        .limit(1)
    )[0];
    const proofPayload = (reveal?.proofPayload ?? {}) as { proofHash?: string; ticketSnapshotHash?: string };
    await writePhase2SettlementProof(tx, {
      roundId,
      plan: {
        grossUsd: amounts.totalPool,
        ticketCount: roundTickets.length,
        settled: true,
        directReferral: Boolean(winner.referredBy),
        kycApproved: winner.kycStatus === "APPROVED",
        refunded: false,
      },
      drawProofHash: proofPayload.proofHash ?? "0".repeat(64),
      ticketSnapshotHash: proofPayload.ticketSnapshotHash ?? "0".repeat(64),
      auditHeadHash: chainEvent.hash,
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
      winningSerial: w.winningSerial ?? "-",
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

export async function buyTickets(userId: number, requested: number, tierSelector?: string | number) {
  const count = Math.min(10, Math.max(1, Math.floor(requested) || 1));
  const serialRetryLimit = 5;

  for (let attempt = 1; attempt <= serialRetryLimit; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
    const tier = await resolveTierConfig(tx, tierSelector);
    await tx.execute(sql`select pg_advisory_xact_lock(${tierLockKey(tier.id)})`);
    const me = (await tx.select().from(users).where(eq(users.id, userId)).for("update"))[0];
    if (!me) throw new UserError("userNotFound", 404);
    assertCanPlay(me);

    let round = (
      await tx
        .select()
        .from(rounds)
        .where(and(
          inArray(rounds.status, [ROUND_STATUSES.OPEN, "open"]),
          eq(rounds.tierId, tier.id),
        ))
        .orderBy(desc(rounds.id))
        .limit(1)
        .for("update")
    )[0];

    if (!round) {
      round = await openNewRound(tx, tier);
    }

    const [sold] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.roundId, round.id), eq(tickets.kind, "gold")));
    const currentSold = sold?.count ?? 0;
    const take = getTicketPurchaseCount(round.capacity, currentSold, count);
    if (take <= 0) throw new UserError("roundFull");

    const cost = roundMoney(take * tier.priceUsd);
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

    const transactionSignature = randomUUID();
    const created = await tx
      .insert(tickets)
      .values(
        Array.from({ length: take }, () => ({
          roundId: round.id,
          userId: me.id,
          username: me.username,
          kind: "gold",
          tierId: tier.id,
          amountUsd: String(tier.priceUsd),
          ticketSerial: makeTicketSerial(round.id),
          walletAddress: me.walletAddress,
          transactionSignature,
          status: "active",
        })),
      )
      .returning();

    await tx.update(users).set({ balance: sql`${users.balance} - ${cost}` }).where(eq(users.id, me.id));
    const newSold = currentSold + take;
    const nextStatus = newSold >= round.capacity ? ROUND_STATUSES.FULL : ROUND_STATUSES.OPEN;

    await tx.update(rounds).set({
      sold: newSold,
      status: nextStatus,
    }).where(eq(rounds.id, round.id));

    if (newSold >= round.capacity) {
      await openNewRound(tx, tier);
    }
    await tx.update(vault).set({ ticketsSold: sql`${vault.ticketsSold} + ${take}`, updatedAt: new Date() });
    await tx.insert(ledger).values({
      userId: me.id,
      username: me.username,
      type: "ticket_buy",
      amount: String(-cost),
      note: `${take} golden tickets · round ${round.id}`,
      account: "user",
      roundId: round.id,
      tierId: tier.id,
      reference: transactionSignature,
      transactionKey: `ticket-purchase:${transactionSignature}`,
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
          tierId: tier.id,
          reference: randomUUID(),
        });
      }
    }

      return {
        serials: created.map((t) => t.ticketSerial),
        roundId: round.id,
        tierCode: tier.code,
        transactionReference: transactionSignature,
        draw: null,
      };
      });
    } catch (error) {
      if (isTicketSerialCollision(error) && attempt < serialRetryLimit) continue;
      throw error;
    }
  }
  throw new Error("ticket serial generation failed");
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

export async function requestWithdrawal(userId: number, amount: number, address: string) {
  const amt = Math.round(amount * 100) / 100;
  if (!Number.isFinite(amt) || amt < config.limits.minWithdraw) {
    throw new UserError("withdrawMin", 400, { min: usd(config.limits.minWithdraw) });
  }
  if (!isValidSolanaAddress(address)) {
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
    const clean = txHash?.trim() ?? "";
    if (!isValidSolanaTxSignature(clean)) throw new UserError("txMismatch");
    const pending = (await db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1))[0];
    if (!pending) throw new UserError("wdNotFound", 404);
    const treasuryAddress = getSolanaConfig().treasuryAddress;
    if (!treasuryAddress) throw new UserError("gatewayOff", 503);
    const chain = await lookupSolanaUsdcTransfers(clean);
    const matchingUnits = chain.status === "confirmed"
      ? chain.transfers
          .filter((transfer) => transfer.from === treasuryAddress && transfer.to === pending.address)
          .reduce((sum: bigint, transfer: { units: bigint }) => sum + transfer.units, BigInt(0))
      : BigInt(0);
    if (matchingUnits !== toSolanaUsdcUnits(Number(pending.amount))) throw new UserError("txMismatch");
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
        note: `Verified withdrawal #${w.id}  · tx ${verifiedTxHash}`,
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
    await appendAdminAuditEvent(tx, {
      actor,
      action: action === "paid" ? "withdrawal.pay" : "withdrawal.reject",
      subject: `withdrawal:${w.id}`,
      metadata: { status: action, txHash: verifiedTxHash, note: note ?? null },
    });
    const u = (await tx.select().from(users).where(eq(users.id, w.userId)).limit(1))[0];
    return { withdrawal: { ...w, status: action }, telegramId: u?.telegramId ?? null, locale: u?.locale ?? "en" };
  });
}

/* ------------------------------------------------------------------ state */

export async function getState(tierSelector?: string | number) {
  const me = await getSessionUser();
  const region = regionStatus(await headers());

  const round = await findOpenRound(tierSelector);
  const tiers = await listActiveTiers();
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
        serial: ticket.ticketSerial,
        kind: ticket.kind,
        createdAt: new Date(ticket.createdAt).toISOString(),
        walletAddress: ticket.walletAddress,
        transactionReference: ticket.transactionSignature,
        ticketStatus: ticket.status,
        status:
          normalizeRoundStatus(ticketRound.status) === ROUND_STATUSES.REFUNDED
            ? "refunded"
            : normalizeRoundStatus(ticketRound.status) !== ROUND_STATUSES.SETTLED
              ? "pending"
              : ticket.ticketSerial === ticketRound.winningSerial
                ? "winner"
                : "lost",
        prize: ticket.ticketSerial === ticketRound.winningSerial ? Number(ticketRound.prize) : 0,
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

  const roundTier = tiers.find((tier) => tier.id === round?.tierId);
  const snapshotTierCode =
    round?.tierSnapshot && typeof round.tierSnapshot === "object" && !Array.isArray(round.tierSnapshot)
      ? String((round.tierSnapshot as Record<string, unknown>).code ?? "")
      : "";
  const roundTierCode =
    roundTier?.code ??
    (tiers.some((tier) => tier.code === snapshotTierCode) ? snapshotTierCode : "usd_1");

  return {
    config: {
      ...publicConfig(),
      solana: {
        enabled: Boolean(process.env.SOLANA_TREASURY_ADDRESS),
        network: process.env.SOLANA_CLUSTER || "mainnet-beta",
        treasuryAddress: process.env.SOLANA_TREASURY_ADDRESS || null,
        usdcMint: process.env.SOLANA_USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
        rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        explorer: "https://solscan.io",
      },
    },
    region,
    tiers,
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
      tierId: round.tierId,
      tierCode: roundTierCode,
      closesAt: round.closesAt ? new Date(round.closesAt).toISOString() : null,
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
        serial: ticket.ticketSerial,
        username: displayName ?? username ?? "Unknown User",
        kind: ticket.kind,
        mine: me ? ticket.userId === me.id : false,
      })),
    } : null,
    winners: winners.map(({ round: w, displayName, username }) => ({
      roundId: w.id,
      winnerName: displayName ?? username ?? "Unknown User",
      winningSerial: w.winningSerial ?? "-",
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



