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

export function tierLockKey(tierId: number): number {
  return 900000 + Math.floor(tierId);
}
