export const BALANCE_SOURCE = {
  ONCHAIN: "ON-CHAIN",
  LEDGER: "INTERNAL LEDGER",
  DEMO: "SIMULATED/DEMO",
} as const;

export type BalanceSourceLabel = (typeof BALANCE_SOURCE)[keyof typeof BALANCE_SOURCE];

export function ledgerSourceLabel(live: boolean): BalanceSourceLabel {
  return live ? BALANCE_SOURCE.LEDGER : BALANCE_SOURCE.DEMO;
}

export function balanceSources(live: boolean) {
  return {
    internalLedger: ledgerSourceLabel(live),
    onchainTreasury: BALANCE_SOURCE.ONCHAIN,
  };
}
