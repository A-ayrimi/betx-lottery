export const REFUND_WINDOW_MS = 72 * 60 * 60 * 1000;

export interface RefundPoolState {
  tier: number;
  openedAt: number | string;
  closedAt?: number | string | null;
  settledAt?: number | string | null;
  refundedAt?: number | string | null;
  rolledOverAt?: number | string | null;
}

export type RefundDecision = "pending" | "eligible" | "settled" | "resolved";

function timestamp(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function refundDeadline(pool: RefundPoolState): number | null {
  const startedAt = timestamp(pool.closedAt) ?? timestamp(pool.openedAt);
  return startedAt === null ? null : startedAt + REFUND_WINDOW_MS;
}

export function evaluateRefundEligibility(pool: RefundPoolState, nowMs = Date.now()): RefundDecision {
  if (pool.settledAt != null) return "settled";
  if (pool.refundedAt != null || pool.rolledOverAt != null) return "resolved";
  const deadline = refundDeadline(pool);
  if (deadline === null) return "pending";
  return nowMs >= deadline ? "eligible" : "pending";
}

export interface RefundLedgerEntry {
  type: "refund";
  poolId: string;
  userId: string;
  amountCents: number;
  createdAt: string;
}

export interface RolloverLedgerEntry {
  type: "rollover";
  poolId: string;
  userId: string;
  fromTier: number;
  toTier: number;
  amountCents: number;
  createdAt: string;
}

export function buildRefundEntry(input: {
  poolId: string;
  userId: string;
  amountCents: number;
  nowMs?: number;
}): RefundLedgerEntry {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Invalid refund amount");
  return {
    type: "refund",
    poolId: input.poolId,
    userId: input.userId,
    amountCents: input.amountCents,
    createdAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}

export function buildRolloverEntry(input: {
  poolId: string;
  userId: string;
  fromTier: number;
  toTier: number;
  amountCents: number;
  nowMs?: number;
}): RolloverLedgerEntry {
  if (input.fromTier !== input.toTier) throw new Error("Rollover tier mismatch");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Invalid rollover amount");
  return {
    type: "rollover",
    poolId: input.poolId,
    userId: input.userId,
    fromTier: input.fromTier,
    toTier: input.toTier,
    amountCents: input.amountCents,
    createdAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}
