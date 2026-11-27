import { roundMoney } from "./tierAccounting.ts";

export type TierAllocationInput = {
  priceUsd: number;
  capacity: number;
  prizePercentage: number;
  treasuryPercentage: number;
  adminPercentage: number;
};

export type TierAmounts = {
  totalPool: number;
  prize: number;
  treasury: number;
  admin: number;
  fee: number;
};

export function deriveTierAmounts(input: TierAllocationInput): TierAmounts {
  const priceUsd = Number(input.priceUsd);
  const capacity = Number(input.capacity);
  const prizePercentage = Number(input.prizePercentage);
  const treasuryPercentage = Number(input.treasuryPercentage);
  const adminPercentage = Number(input.adminPercentage);

  if (![priceUsd, capacity, prizePercentage, treasuryPercentage, adminPercentage].every(Number.isFinite)) {
    throw new Error("Tier allocation contains non-numeric values");
  }
  if (priceUsd <= 0 || capacity <= 0) throw new Error("Tier price and capacity must be positive");
  if (roundMoney(prizePercentage + treasuryPercentage + adminPercentage) !== 100) {
    throw new Error("Tier allocations must sum to 100%");
  }

  const totalPool = roundMoney(priceUsd * capacity);
  const prize = roundMoney((totalPool * prizePercentage) / 100);
  const treasury = roundMoney((totalPool * treasuryPercentage) / 100);
  const admin = roundMoney(totalPool - prize - treasury);

  return { totalPool, prize, treasury, admin, fee: roundMoney(treasury + admin) };
}

export const WINNERS_PER_POOL = 1;

export const WINNER_AMOUNTS_BY_CODE: Readonly<Record<string, readonly [number]>> = {
  starter_1: [37.5],
  bronze_5: [150],
  silver_10: [225],
  gold_25: [375],
  platinum_50: [800],
  diamond_100: [1200],
  vip_whale_200: [1600],
};

export function winnerAmountsForTier(input: {
  code: string;
  prize?: number;
  rules?: Record<string, unknown> | null;
}): [number] {
  const fromRules = input.rules?.winnerAmountsUsd;
  if (Array.isArray(fromRules) && fromRules.length >= 1) {
    const winnerAmount = Number(fromRules[0]);
    if (Number.isFinite(winnerAmount) && winnerAmount >= 0) return [roundMoney(winnerAmount)];
  }
  const mapped = WINNER_AMOUNTS_BY_CODE[input.code];
  if (mapped) return [mapped[0]];
  const prize = Number(input.prize ?? 0);
  return [Number.isFinite(prize) && prize > 0 ? roundMoney(prize) : 0];
}

export function tierLockKey(tierId: number): number {
  return 900000 + Math.floor(tierId);
}
