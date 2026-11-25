export type TierObligationInput = {
  totalPool: number;
  prize: number;
  treasury: number;
  admin: number;
  postedOut: number;
  pendingOut: number;
};

export type TierObligationSummary = {
  grossObligation: number;
  outflow: number;
  reservedOut: number;
  netObligation: number;
  balanced: boolean;
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeTierObligation(input: TierObligationInput): TierObligationSummary {
  const totalPool = roundMoney(input.totalPool);
  const prize = roundMoney(input.prize);
  const treasury = roundMoney(input.treasury);
  const admin = roundMoney(input.admin);
  const postedOut = roundMoney(input.postedOut);
  const pendingOut = roundMoney(input.pendingOut);
  const grossObligation = roundMoney(prize + treasury + admin);
  const outflow = roundMoney(postedOut);
  const reservedOut = roundMoney(pendingOut);

  return {
    grossObligation,
    outflow,
    reservedOut,
    netObligation: roundMoney(grossObligation - outflow),
    balanced: Math.abs(totalPool - grossObligation) < 0.005,
  };
}

export function totalNetObligation(summaries: readonly TierObligationSummary[]): number {
  return roundMoney(summaries.reduce((sum, item) => sum + item.netObligation, 0));
}

export function assessTreasuryCoverage(input: {
  onchainUsdc: number | null;
  userBalances: number;
  unmatchedDeposits: number;
  netObligations: number;
}): {
  expectedLiabilities: number;
  delta: number | null;
  covered: boolean | null;
} {
  const expectedLiabilities = roundMoney(
    input.userBalances + input.unmatchedDeposits + input.netObligations,
  );
  if (input.onchainUsdc === null || !Number.isFinite(input.onchainUsdc)) {
    return { expectedLiabilities, delta: null, covered: null };
  }
  const delta = roundMoney(input.onchainUsdc - expectedLiabilities);
  return { expectedLiabilities, delta, covered: delta >= 0 };
}
