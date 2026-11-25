import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ledger,
  roundSettlements,
  rounds,
  ticketTiers,
  tickets,
  treasuryTransactions,
  unmatchedTransfers,
  users,
  withdrawals,
} from "@/db/schema";
import { config } from "@/lib/config";
import { getTreasuryOnchain, type OnchainTreasury } from "@/lib/onchain";
import {
  assessTreasuryCoverage,
  roundMoney,
  summarizeTierObligation,
  totalNetObligation,
  type TierObligationSummary,
} from "@/lib/tierAccounting";

const SETTLED_STATUSES = ["SETTLED", "settled"];
const OPEN_STATUSES = ["OPEN", "FULL", "AWAITING_ADMIN_APPROVAL", "APPROVED", "open", "full"];
const FINANCIAL_LEDGER_TYPES = [
  "ticket_buy",
  "ticket_refund",
  "prize",
  "ticket_revenue",
  "prize_allocation",
  "treasury_contribution",
  "admin_gross_revenue",
  "vault_seed",
  "initial_capital",
  "withdraw_paid",
];

export type TierReconciliationRow = TierObligationSummary & {
  tierId: number;
  code: string;
  name: string;
  priceUsd: number;
  capacity: number;
  settledRounds: number;
  ticketsSold: number;
  ticketRevenue: number;
  totalPool: number;
  prizeObligation: number;
  treasuryObligation: number;
  adminObligation: number;
  postedOut: number;
  pendingOut: number;
  outflowsByCategory: Record<string, number>;
};

export type ReconciliationInvariant = {
  key: string;
  ok: boolean;
  detail: string;
};

export type TreasuryReconciliationReport = {
  generatedAt: string;
  treasuryAddress: string;
  onchain: OnchainTreasury | null;
  totals: {
    userBalances: number;
    pendingWithdrawals: number;
    verifiedDepositCredits: number;
    unmatchedDeposits: number;
    openRoundCommitments: number;
    settledTicketRevenue: number;
    settledRoundCount: number;
    grossObligations: number;
    postedOutflows: number;
    pendingOutflows: number;
    netObligations: number;
    expectedLiabilities: number;
    onchainUsdc: number | null;
    delta: number | null;
  };
  tiers: TierReconciliationRow[];
  invariants: ReconciliationInvariant[];
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getTreasuryReconciliation(options?: {
  skipOnchain?: boolean;
}): Promise<TreasuryReconciliationReport> {
  const [tierRows, revenueRows, obligationRows, transferRows, userTotals, unmatchedRows, depositCredits, openRows, pendingRows, ledgerIntegrity, missingTransferHashes] =
    await Promise.all([
      db.select().from(ticketTiers).orderBy(asc(ticketTiers.displayOrder), asc(ticketTiers.id)),
      db
        .select({
          tierId: rounds.tierId,
          ticketsSold: sql<number>`count(${tickets.id})::int`,
          ticketRevenue: sql<string>`coalesce(sum(${tickets.amountUsd}), 0)`,
        })
        .from(tickets)
        .innerJoin(rounds, eq(rounds.id, tickets.roundId))
        .where(inArray(rounds.status, SETTLED_STATUSES))
        .groupBy(rounds.tierId),
      db
        .select({
          tierId: rounds.tierId,
          settledRounds: sql<number>`count(*)::int`,
          totalPool: sql<string>`coalesce(sum(coalesce(${roundSettlements.totalPool}, ${rounds.prize} + coalesce(${rounds.treasuryContribution}, 0) + coalesce(${rounds.adminGrossRevenue}, 0))), 0)`,
          prize: sql<string>`coalesce(sum(coalesce(${roundSettlements.winnerAmount}, ${rounds.prize})), 0)`,
          treasury: sql<string>`coalesce(sum(coalesce(${roundSettlements.treasuryAmount}, ${rounds.treasuryContribution}, 0)), 0)`,
          admin: sql<string>`coalesce(sum(coalesce(${roundSettlements.adminAmount}, ${rounds.adminGrossRevenue}, 0)), 0)`,
        })
        .from(rounds)
        .leftJoin(roundSettlements, eq(roundSettlements.roundId, rounds.id))
        .where(and(inArray(rounds.status, SETTLED_STATUSES), isNotNull(rounds.approvedAt), isNotNull(rounds.settledAt)))
        .groupBy(rounds.tierId),
      db
        .select({
          tierId: treasuryTransactions.tierId,
          category: treasuryTransactions.category,
          status: treasuryTransactions.status,
          total: sql<string>`coalesce(sum(${treasuryTransactions.amount}), 0)`,
        })
        .from(treasuryTransactions)
        .where(and(eq(treasuryTransactions.direction, "OUT"), inArray(treasuryTransactions.status, ["POSTED", "PENDING"])))
        .groupBy(treasuryTransactions.tierId, treasuryTransactions.category, treasuryTransactions.status),
      db
        .select({
          userBalances: sql<string>`coalesce(sum(${users.balance}), 0)`,
          userCount: sql<number>`count(*)::int`,
        })
        .from(users),
      db
        .select({ total: sql<string>`coalesce(sum(${unmatchedTransfers.amount}), 0)` })
        .from(unmatchedTransfers),
      db
        .select({ total: sql<string>`coalesce(sum(${ledger.amount}), 0)` })
        .from(ledger)
        .where(and(
          eq(ledger.type, "deposit"),
          eq(ledger.account, "user"),
          isNotNull(ledger.reference),
          isNotNull(ledger.transactionKey),
        )),
      db
        .select({ total: sql<string>`coalesce(sum(${tickets.amountUsd}), 0)` })
        .from(tickets)
        .innerJoin(rounds, eq(rounds.id, tickets.roundId))
        .where(inArray(rounds.status, OPEN_STATUSES)),
      db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${withdrawals.amount}), 0)`,
        })
        .from(withdrawals)
        .where(eq(withdrawals.status, "pending")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(ledger)
        .where(and(
          inArray(ledger.type, FINANCIAL_LEDGER_TYPES),
          or(isNull(ledger.account), isNull(ledger.reference), isNull(ledger.transactionKey)),
        )),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(treasuryTransactions)
        .where(and(
          eq(treasuryTransactions.direction, "OUT"),
          eq(treasuryTransactions.status, "POSTED"),
          isNull(treasuryTransactions.txHash),
        )),
    ]);

  const onchain = options?.skipOnchain ? null : await getTreasuryOnchain();

  const revenueByTier = new Map(revenueRows.map((row) => [row.tierId, row]));
  const obligationByTier = new Map(obligationRows.map((row) => [row.tierId, row]));
  const transfersByTier = new Map<number, { posted: number; pending: number; categories: Record<string, number> }>();
  for (const row of transferRows) {
    const entry = transfersByTier.get(row.tierId) ?? { posted: 0, pending: 0, categories: {} };
    const amount = num(row.total);
    if (row.status === "POSTED") entry.posted += amount;
    if (row.status === "PENDING") entry.pending += amount;
    entry.categories[row.category] = roundMoney((entry.categories[row.category] ?? 0) + amount);
    transfersByTier.set(row.tierId, entry);
  }

  const tiers: TierReconciliationRow[] = tierRows.map((tier) => {
    const revenue = revenueByTier.get(tier.id);
    const obligation = obligationByTier.get(tier.id);
    const transfers = transfersByTier.get(tier.id);
    const totalPool = num(obligation?.totalPool);
    const prizeObligation = num(obligation?.prize);
    const treasuryObligation = num(obligation?.treasury);
    const adminObligation = num(obligation?.admin);
    const postedOut = roundMoney(transfers?.posted ?? 0);
    const pendingOut = roundMoney(transfers?.pending ?? 0);
    const summary = summarizeTierObligation({
      totalPool,
      prize: prizeObligation,
      treasury: treasuryObligation,
      admin: adminObligation,
      postedOut,
      pendingOut,
    });

    return {
      ...summary,
      tierId: tier.id,
      code: tier.code,
      name: tier.name,
      priceUsd: num(tier.priceUsd),
      capacity: tier.ticketCapacity,
      settledRounds: obligation?.settledRounds ?? 0,
      ticketsSold: revenue?.ticketsSold ?? 0,
      ticketRevenue: roundMoney(num(revenue?.ticketRevenue)),
      totalPool: roundMoney(totalPool),
      prizeObligation: roundMoney(prizeObligation),
      treasuryObligation: roundMoney(treasuryObligation),
      adminObligation: roundMoney(adminObligation),
      postedOut,
      pendingOut,
      outflowsByCategory: transfers?.categories ?? {},
    };
  });

  const netObligations = totalNetObligation(tiers);
  const userBalances = roundMoney(num(userTotals[0]?.userBalances));
  const unmatchedDeposits = roundMoney(num(unmatchedRows[0]?.total));
  const openRoundCommitments = roundMoney(num(openRows[0]?.total));
  const grossObligations = roundMoney(tiers.reduce((sum, tier) => sum + tier.grossObligation, 0));
  const postedOutflows = roundMoney(tiers.reduce((sum, tier) => sum + tier.outflow, 0));
  const pendingOutflows = roundMoney(tiers.reduce((sum, tier) => sum + tier.reservedOut, 0));
  const settledTicketRevenue = roundMoney(tiers.reduce((sum, tier) => sum + tier.ticketRevenue, 0));

  const coverage = assessTreasuryCoverage({
    onchainUsdc: onchain?.status === "ok" ? onchain.usdc : null,
    userBalances,
    unmatchedDeposits: roundMoney(unmatchedDeposits + openRoundCommitments + pendingOutflows),
    netObligations,
  });

  const invariants: ReconciliationInvariant[] = [
    {
      key: "TIER_PERCENTAGES_BALANCED",
      ok: tiers.every((tier) => {
        const found = tierRows.find((row) => row.id === tier.tierId);
        return found ? num(found.prizePercentage) + num(found.treasuryPercentage) + num(found.adminPercentage) === 100 : false;
      }),
      detail: "Every configured tier must allocate exactly 100% of its pool.",
    },
    {
      key: "SETTLEMENT_ALLOCATIONS_BALANCED",
      ok: tiers.every((tier) => tier.balanced),
      detail: "Each settled pool must equal prize + treasury + administrator allocation.",
    },
    {
      key: "LEDGER_PROVENANCE_COMPLETE",
      ok: (ledgerIntegrity[0]?.count ?? 0) === 0,
      detail: `${ledgerIntegrity[0]?.count ?? 0} financial ledger entries lack reference provenance.`,
    },
    {
      key: "TREASURY_TRANSFERS_VERIFIED",
      ok: (missingTransferHashes[0]?.count ?? 0) === 0,
      detail: `${missingTransferHashes[0]?.count ?? 0} posted treasury outflows lack an on-chain signature.`,
    },
    {
      key: "ONCHAIN_BALANCE_AVAILABLE",
      ok: onchain?.status === "ok",
      detail: onchain ? `Treasury read status: ${onchain.status}.` : "On-chain read was skipped.",
    },
    {
      key: "TREASURY_COVERAGE",
      ok: coverage.covered === true,
      detail:
        coverage.delta === null
          ? "Coverage cannot be computed without a confirmed on-chain balance."
          : `On-chain balance minus expected liabilities is $${coverage.delta.toFixed(2)}.`,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    treasuryAddress: config.adminWallet,
    onchain,
    totals: {
      userBalances,
      pendingWithdrawals: roundMoney(num(pendingRows[0]?.total)),
      verifiedDepositCredits: roundMoney(num(depositCredits[0]?.total)),
      unmatchedDeposits,
      openRoundCommitments,
      settledTicketRevenue,
      settledRoundCount: obligationRows.reduce((sum, row) => sum + row.settledRounds, 0),
      grossObligations,
      postedOutflows,
      pendingOutflows,
      netObligations,
      expectedLiabilities: coverage.expectedLiabilities,
      onchainUsdc: onchain?.status === "ok" ? onchain.usdc : null,
      delta: coverage.delta,
    },
    tiers,
    invariants,
  };
}
