export type RoundAccountingInput = {
  ticketRevenue: number;
  prize: number;
  treasury: number;
  adminRevenue: number;
};

export function getTicketPurchaseCount(capacity: number, sold: number, requested: number) {
  if (![capacity, sold, requested].every(Number.isFinite) || capacity < 0 || sold < 0 || requested < 0) return 0;
  return Math.min(Math.floor(requested), Math.max(0, capacity - sold));
}

export function getRoundAccountingEntries(input: RoundAccountingInput) {
  if (input.ticketRevenue !== input.prize + input.treasury + input.adminRevenue) {
    throw new Error("Round accounting allocations do not reconcile");
  }
  return [
    { type: "ticket_revenue", amount: -input.ticketRevenue },
    { type: "prize_allocation", amount: input.prize },
    { type: "treasury_contribution", amount: input.treasury },
    { type: "admin_gross_revenue", amount: input.adminRevenue },
  ] as const;
}
