export const VAULT_GROWTH_BPS = 8000;
export const VAULT_JACKPOT_BPS = 2000;
export const REFERRAL_RATE_BPS = 200;

export interface VaultAllocation {
  grossCents: number;
  growthCents: number;
  jackpotCents: number;
}

export function allocateVault(grossCents: number): VaultAllocation {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("Invalid gross amount");
  const jackpotCents = Math.round((grossCents * VAULT_JACKPOT_BPS) / 10000);
  const growthCents = grossCents - jackpotCents;
  return { grossCents, growthCents, jackpotCents };
}

export interface VaultLedgerEntry {
  id: string;
  roundId: string;
  grossCents: number;
  growthCents: number;
  jackpotCents: number;
  referralCents?: number;
}

export function validateVaultLedger(entries: readonly VaultLedgerEntry[]): boolean {
  return entries.every((entry) => {
    const allocation = allocateVault(entry.grossCents);
    if (allocation.growthCents !== entry.growthCents || allocation.jackpotCents !== entry.jackpotCents) return false;
    const referral = entry.referralCents ?? 0;
    if (referral < 0 || referral > entry.growthCents) return false;
    return true;
  });
}

export interface ReferralInput {
  grossCents: number;
  settled: boolean;
  directReferral: boolean;
  kycApproved: boolean;
  refunded: boolean;
}

export interface ReferralCommission {
  payable: boolean;
  amountCents: number;
  source: "vault-growth" | "none";
  reason: "settled" | "not-settled" | "not-direct" | "kyc-required" | "refunded";
}

export function computeReferralCommission(input: ReferralInput): ReferralCommission {
  if (input.refunded) return { payable: false, amountCents: 0, source: "none", reason: "refunded" };
  if (!input.settled) return { payable: false, amountCents: 0, source: "none", reason: "not-settled" };
  if (!input.directReferral) return { payable: false, amountCents: 0, source: "none", reason: "not-direct" };
  if (!input.kycApproved) return { payable: false, amountCents: 0, source: "none", reason: "kyc-required" };
  return {
    payable: true,
    amountCents: Math.floor((input.grossCents * REFERRAL_RATE_BPS) / 10000),
    source: "vault-growth",
    reason: "settled",
  };
}
