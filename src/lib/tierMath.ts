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

export const WINNER_AMOUNTS_BY_CODE: Readonly<Record<string, readonly [number, number, number]>> = {
  starter_1: [30, 5, 2.5],
  bronze_5: [120, 20, 10],
  silver_10: [180, 30, 15],
  gold_25: [300, 50, 25],
  platinum_50: [650, 100, 50],
  diamond_100: [975, 150, 75],
  vip_whale_200: [1300, 200, 100],
};

export function winnerAmountsForTier(input: {
  code: string;
  prize?: number;
  rules?: Record<string, unknown> | null;
}): [number, number, number] {
  const fromRules = input.rules?.winnerAmountsUsd;
  if (Array.isArray(fromRules) && fromRules.length >= 3) {
    const parsed = fromRules.slice(0, 3).map((value) => Number(value));
    if (parsed.every((value) => Number.isFinite(value) && value >= 0)) return parsed as [number, number, number];
  }
  const mapped = WINNER_AMOUNTS_BY_CODE[input.code];
  if (mapped) return [mapped[0], mapped[1], mapped[2]];
  const prize = Number(input.prize ?? 0);
  if (!Number.isFinite(prize) || prize <= 0) return [0, 0, 0];
  const first = roundMoney(prize * 0.8);
  const second = roundMoney(prize * 0.1333333333);
  return [first, second, roundMoney(prize - first - second)];
}

export function tierLockKey(tierId: number): number {
  return 900000 + Math.floor(tierId);
}
