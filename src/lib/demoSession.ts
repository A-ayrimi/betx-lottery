import type { AppState, DrawResult, UserState } from "./types.ts";
import type { VaultCandle } from "./vaultCandles.ts";
import { previewVaultCandles } from "./previewCandles.ts";
import { winnerAmountsForTier } from "./tierMath.ts";
import { WHEEL_SECTORS } from "./wheel.ts";

export const DEMO_WALLET_ADDRESS = "SOL_DEMO_WALLET_9999";
export const DEMO_TREASURY_ADDRESS = "SOL_DEMO_TREASURY_9999";
export const DEMO_SESSION_KEY = "betx_demo_session_v1";
export const DEMO_STARTING_BALANCE = 100;

const DEMO_TIER_CONFIG = [
  { id: 1, code: "starter_1", name: "Starter $1", displayOrder: 1, priceUsd: 1, capacity: 50, prizePercentage: 75, treasuryPercentage: 15, adminPercentage: 10, prize: 37.5, treasury: 7.5, admin: 5 },
  { id: 2, code: "bronze_5", name: "Bronze $5", displayOrder: 2, priceUsd: 5, capacity: 40, prizePercentage: 75, treasuryPercentage: 15, adminPercentage: 10, prize: 150, treasury: 30, admin: 20 },
  { id: 3, code: "silver_10", name: "Silver $10", displayOrder: 3, priceUsd: 10, capacity: 30, prizePercentage: 75, treasuryPercentage: 15, adminPercentage: 10, prize: 225, treasury: 45, admin: 30 },
  { id: 4, code: "gold_25", name: "Gold $25", displayOrder: 4, priceUsd: 25, capacity: 20, prizePercentage: 75, treasuryPercentage: 15, adminPercentage: 10, prize: 375, treasury: 75, admin: 50 },
  { id: 5, code: "platinum_50", name: "Platinum $50", displayOrder: 5, priceUsd: 50, capacity: 20, prizePercentage: 80, treasuryPercentage: 12, adminPercentage: 8, prize: 800, treasury: 120, admin: 80 },
  { id: 6, code: "diamond_100", name: "Diamond $100", displayOrder: 6, priceUsd: 100, capacity: 15, prizePercentage: 80, treasuryPercentage: 12, adminPercentage: 8, prize: 1200, treasury: 180, admin: 120 },
  { id: 7, code: "vip_whale_200", name: "VIP Whale $200", displayOrder: 7, priceUsd: 200, capacity: 10, prizePercentage: 80, treasuryPercentage: 12, adminPercentage: 8, prize: 1600, treasury: 240, admin: 160 },
] as const;

const DEMO_STARTER_TIER = DEMO_TIER_CONFIG[0];

const DEMO_TIERS = DEMO_TIER_CONFIG.map((tier) => ({
  ...tier,
  status: "ACTIVE" as const,
  drawDurationMinutes: 4320,
  minimumParticipants: 1,
  maximumParticipants: tier.capacity,
  winnerAmounts: winnerAmountsForTier({ code: tier.code, prize: tier.prize }),
  rules: {},
}));

export const PREVIEW_TIER_SALES: Readonly<Record<string, number>> = {
  starter_1: 18,
  bronze_5: 12,
  silver_10: 9,
  gold_25: 6,
  platinum_50: 7,
  diamond_100: 5,
  vip_whale_200: 4,
};

const PREVIEW_BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function previewTicketSerial(roundId: number, index: number) {
  const randomPart = Array.from(
    { length: 12 },
    (_, position) => PREVIEW_BASE58[(roundId * 7 + index * 31 + position * 17) % PREVIEW_BASE58.length],
  ).join("");
  const checksum = PREVIEW_BASE58[(roundId + index) % PREVIEW_BASE58.length];
  return `BTX-R${roundId}-${randomPart}-${checksum}`;
}

export function previewTicketsForTier(tierCode: string, sold: number) {
  const tier = DEMO_TIER_CONFIG.find((item) => item.code === tierCode);
  const capacity = tier?.capacity ?? sold;
  const count = Math.max(0, Math.min(capacity, Math.floor(sold)));
  return Array.from({ length: count }, (_, index) => ({
    id: -(index + 1),
    serial: previewTicketSerial(tier?.id ?? 1, index + 1),
    username: "Preview User",
    kind: "paid" as const,
    mine: false,
  }));
}

export function previewWinners(nowMs = Date.now()) {
  return [
    {
      roundId: 101,
      winnerName: "Preview Winner",
      winningSerial: previewTicketSerial(101, 3),
      prize: 37.5,
      fee: 12.5,
      capacity: 50,
      sold: 50,
      drawnAt: new Date(nowMs - 2 * 3_600_000).toISOString(),
      openedAt: new Date(nowMs - 3 * 3_600_000).toISOString(),
      seedHash: "PREVIEW-ONLY",
      serverSeed: null,
      feeStatus: "verified",
      feeTxHash: null,
    },
    {
      roundId: 100,
      winnerName: "Preview Player",
      winningSerial: previewTicketSerial(100, 7),
      prize: 150,
      fee: 30,
      capacity: 40,
      sold: 40,
      drawnAt: new Date(nowMs - 9 * 3_600_000).toISOString(),
      openedAt: new Date(nowMs - 10 * 3_600_000).toISOString(),
      seedHash: "PREVIEW-ONLY",
      serverSeed: null,
      feeStatus: "verified",
      feeTxHash: null,
    },
    {
      roundId: 99,
      winnerName: "Preview Member",
      winningSerial: previewTicketSerial(99, 5),
      prize: 225,
      fee: 45,
      capacity: 30,
      sold: 30,
      drawnAt: new Date(nowMs - 26 * 3_600_000).toISOString(),
      openedAt: new Date(nowMs - 27 * 3_600_000).toISOString(),
      seedHash: "PREVIEW-ONLY",
      serverSeed: null,
      feeStatus: "verified",
      feeTxHash: null,
    },
  ];
}

export function previewActivity(nowMs = Date.now()) {
  return [
    { id: -1, type: "ticket_buy" as const, user: "Preview User", amount: 25, at: new Date(nowMs - 4 * 60_000).toISOString() },
    { id: -2, type: "prize" as const, user: "Preview Winner", amount: 37.5, at: new Date(nowMs - 2 * 3_600_000).toISOString() },
    { id: -3, type: "ticket_buy" as const, user: "Preview Player", amount: 10, at: new Date(nowMs - 5 * 3_600_000).toISOString() },
  ];
}

interface StoredDemoSession {
  version: 1;
  address: string;
  state: DemoAppState;
}

type DemoAppState = Omit<AppState, "round"> & { round: NonNullable<AppState["round"]> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDemoState(value: unknown): value is DemoAppState {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.round) || !isRecord(value.vault)) return false;
  const user = value.user;
  return (
    value.config.live === false &&
    isRecord(user) &&
    user.walletAddress === DEMO_WALLET_ADDRESS &&
    typeof user.balance === "number" &&
    Array.isArray(user.tickets) &&
    Array.isArray(value.round.tickets) &&
    Array.isArray(value.winners) &&
    Array.isArray(value.activity)
  );
}

export function isDemoAppState(state: AppState): state is DemoAppState {
  return state.config.live === false && state.round !== null && state.user?.walletAddress === DEMO_WALLET_ADDRESS;
}

export function isPreviewAppState(state: AppState | null | undefined): boolean {
  return Boolean(
    state &&
      !state.config.live &&
      state.round?.seedHash === "PREVIEW-ONLY" &&
      state.vault.ledgerStatus === "demo",
  );
}

export function loadDemoSession(): StoredDemoSession | null {
  const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    return null;
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.address !== DEMO_WALLET_ADDRESS ||
    !isDemoState(parsed.state)
  ) {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
    return null;
  }
  return { version: 1, address: DEMO_WALLET_ADDRESS, state: parsed.state };
}

export function saveDemoSession(state: DemoAppState) {
  if (!state.user || state.user.walletAddress !== DEMO_WALLET_ADDRESS) {
    throw new Error("Cannot persist a non-demo wallet session");
  }
  const session: StoredDemoSession = { version: 1, address: DEMO_WALLET_ADDRESS, state };
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
}

export function clearDemoSession() {
  window.localStorage.removeItem(DEMO_SESSION_KEY);
}

export function createDemoState(walletAddress: string | null = null, locale = "en", nowMs = Date.now()): DemoAppState {
  const now = new Date(nowMs).toISOString();
  const user: UserState | null = walletAddress
    ? {
        id: 0,
        username: "demo_tester",
        displayName: "Demo Tester",
        telegram: null,
        telegramLinked: false,
        walletAddress,
        referralCode: "DEMO9999",
        balance: DEMO_STARTING_BALANCE,
        totalDeposited: DEMO_STARTING_BALANCE,
        payoutAddress: walletAddress,
        bonusSpins: 0,
        tickets: [],
        locale,
        termsAccepted: true,
        selfExcludedUntil: null,
        depositLimit: null,
        pendingLimit: null,
        canSpin: true,
        nextSpinAt: null,
        deposits: [
          {
            id: -1,
            amount: DEMO_STARTING_BALANCE,
            status: "finished",
            credited: true,
            provider: "demo",
            invoiceUrl: null,
            createdAt: now,
          },
        ],
        withdrawals: [],
      }
    : null;

  return {
    config: {
      company: "BETX",
      license: null,
      supportEmail: "support.betx@gmail.com",
      helpUrl: "https://www.begambleaware.org",
      live: false,
      maintenance: false,
      maintenanceMode: false,
      paymentsEnabled: false,
      botUsername: null,
      minDeposit: 1,
      minWithdraw: 5,
      referralDepositBonus: 0.5,
      adminWallet: DEMO_TREASURY_ADDRESS,
      solanaOnly: true,
      totalRoundRevenue: DEMO_STARTER_TIER.priceUsd * DEMO_STARTER_TIER.capacity,
      prizePerRound: DEMO_STARTER_TIER.prize,
      treasuryContributionPerRound: DEMO_STARTER_TIER.treasury,
      adminGrossRevenuePerRound: DEMO_STARTER_TIER.admin,
      roundCapacity: DEMO_STARTER_TIER.capacity,
      ticketPrice: DEMO_STARTER_TIER.priceUsd,
      solana: {
        enabled: false,
        network: "mainnet-beta",
        treasuryAddress: "5TekXvxKMMhhHea399Kyf28Paun9pY3QhAtUte4N8xdy",
        usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        decimals: 6,
        rpcUrl: "https://api.mainnet-beta.solana.com",
        explorer: "https://solscan.io",
      },
    },
    region: { country: null, blocked: false },
    tiers: DEMO_TIERS,
    vault: {
      balance: 20,
      initialCapital: 20,
      totalFees: 0,
      totalPaid: 0,
      treasuryPaid: 0,
      roundsCompleted: 0,
      ticketsSold: 0,
      adminWallet: DEMO_TREASURY_ADDRESS,
      adminEarnings: 0,
      adminPaid: 0,
      ledgerStatus: "demo",
      feePending: 0,
      feePendingCount: 0,
    },
    round: {
      id: 1,
      tierId: 1,
      tierCode: "starter_1",
      closesAt: new Date(nowMs + 72 * 3600 * 1000).toISOString(),
      status: "OPEN",
      capacity: 50,
      sold: 0,
      remaining: 50,
      prize: 37.5,
      fee: 7.5,
      treasuryContribution: 7.5,
      adminGrossRevenue: 5,
      seedHash: "DEMO-ONLY",
      tickets: [],
    },
    winners: [],
    leaderboard: user
      ? [{ username: user.username, displayName: user.displayName, tickets: 0, won: 0 }]
      : [],
    stats: { players: user ? 1 : 0, ticketsLast24: 0 },
    activity: [],
    user,
  };
}

export function createPreviewState(locale = "en", nowMs = Date.now()): DemoAppState & { candles: VaultCandle[] } {
  const base = createDemoState(null, locale, nowMs);
  const sold = PREVIEW_TIER_SALES.starter_1 ?? 0;
  return {
    ...base,
    candles: previewVaultCandles("24h", nowMs),
    config: {
      ...base.config,
      live: false,
      maintenance: true,
      maintenanceMode: true,
      paymentsEnabled: false,
    },
    vault: {
      ...base.vault,
      balance: 12840,
      initialCapital: 20,
      totalFees: 6420,
      totalPaid: 0,
      treasuryPaid: 0,
      roundsCompleted: 148,
      ticketsSold: 1840,
      adminEarnings: 1284,
      adminPaid: 0,
      ledgerStatus: "demo",
      feePending: 0,
      feePendingCount: 0,
    },
    round: {
      ...base.round,
      sold,
      remaining: Math.max(0, base.round.capacity - sold),
      seedHash: "PREVIEW-ONLY",
      tickets: previewTicketsForTier(base.round.tierCode, sold),
    },
    stats: { players: 61, ticketsLast24: 184 },
    winners: previewWinners(nowMs),
    activity: previewActivity(nowMs),
  };
}

export function previewProgress(nowMs = Date.now()) {
  const state = createPreviewState("en", nowMs);
  return state.tiers.map((tier) => {
    const capacity = tier.capacity;
    const sold = Math.max(0, Math.min(capacity, PREVIEW_TIER_SALES[tier.code] ?? 0));
    return {
      code: tier.code,
      tierNumber: tier.displayOrder,
      roundId: tier.id,
      sold,
      capacity,
      remaining: capacity - sold,
      seedHash: state.round.seedHash,
      closesAt: state.round.closesAt,
    };
  });
}

export const previewTierProgress = previewProgress;

function randomUnit() {
  return Math.random();
}

export function buyDemoTickets(state: DemoAppState, requested: number) {
  const user = state.user;
  if (!user) return { state, serials: [], roundId: state.round.id, transactionReference: null, draw: null, error: "login" as const };
  if (user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > Date.now()) {
    return { state, serials: [], roundId: state.round.id, transactionReference: null, draw: null, error: "excluded" as const };
  }

  const take = Math.min(10, Math.max(1, Math.floor(requested) || 1), state.round.remaining);
  if (take < 1) return { state, serials: [], roundId: state.round.id, transactionReference: null, draw: null, error: "roundFull" as const };
  const cost = take * state.config.ticketPrice;
  if (user.balance < cost) return { state, serials: [], roundId: state.round.id, transactionReference: null, draw: null, error: "insufficient" as const };

  const createdAt = new Date().toISOString();
  const tickets = Array.from({ length: take }, (_, index) => {
    const serial = previewTicketSerial(state.round.id, state.vault.ticketsSold + index + 1);
    return {
      id: state.vault.ticketsSold + index + 1,
      roundId: state.round.id,
      serial,
      kind: "gold" as const,
      createdAt,
      walletAddress: user.walletAddress ?? null,
      transactionReference: `DEMO-${state.round.id}-${state.vault.ticketsSold + index + 1}`,
      ticketStatus: "active" as const,
      status: "pending" as const,
      prize: 0,
      winningSerial: null,
    };
  });
  const serials = tickets.map((ticket) => ticket.serial);
  const roundTickets = tickets.map((ticket) => ({
    id: ticket.id,
    serial: ticket.serial,
    username: user.username,
    kind: ticket.kind,
    mine: true,
  }));
  const sold = state.round.sold + take;
  const nextUser: UserState = {
    ...user,
    balance: user.balance - cost,
    tickets: [...tickets, ...user.tickets],
  };
  const purchaseActivity: AppState["activity"][number] = {
    id: state.vault.ticketsSold + take,
    type: "ticket_buy",
    user: user.username,
    amount: cost,
    at: createdAt,
  };
  let nextState: DemoAppState = {
    ...state,
    user: nextUser,
    leaderboard: [
      {
        username: user.username,
        displayName: user.displayName,
        tickets: nextUser.tickets.length,
        won: state.leaderboard.find((row) => row.username === user.username)?.won ?? 0,
      },
    ],
    round: {
      ...state.round,
      sold,
      remaining: state.round.capacity - sold,
      tickets: [...state.round.tickets, ...roundTickets],
    },
    vault: { ...state.vault, ticketsSold: state.vault.ticketsSold + take },
    stats: { ...state.stats, ticketsLast24: state.stats.ticketsLast24 + take },
    activity: [purchaseActivity, ...state.activity].slice(0, 20),
  };

  if (sold < state.round.capacity) {
    return {
      state: nextState,
      serials,
      roundId: state.round.id,
      transactionReference: tickets[0]?.transactionReference ?? null,
      draw: null,
      error: null,
    };
  }

  const pool = nextState.round.tickets;
  const winner = pool[Math.floor(randomUnit() * pool.length)];
  const drawnAt = new Date().toISOString();
  const prize = state.round.prize;
  const fee = state.round.fee;
  const winningTickets: UserState["tickets"] = nextUser.tickets.map((ticket) =>
    ticket.roundId === state.round.id
      ? {
          ...ticket,
          status: ticket.serial === winner.serial ? "winner" : "lost",
          prize: ticket.serial === winner.serial ? prize : 0,
          winningSerial: winner.serial,
        }
      : ticket,
  );
  const finalUser: UserState = { ...nextUser, balance: nextUser.balance + prize, tickets: winningTickets };
  const result: DrawResult = {
    winnerName: user.displayName || user.username,
    winningSerial: winner.serial,
    prize,
    fee,
    roundId: state.round.id,
    serverSeed: "DEMO-ONLY",
    drawnAt,
    adminWallet: state.vault.adminWallet,
    serials: pool.map((ticket) => ticket.serial),
    youWon: winner.mine,
    yourTickets: pool.filter((ticket) => ticket.mine).length,
    demo: true,
  };
  const history: AppState["winners"][number] = {
    roundId: state.round.id,
    winnerName: result.winnerName,
    winningSerial: result.winningSerial,
    prize,
    fee,
    capacity: state.round.capacity,
    sold,
    drawnAt,
    openedAt: createdAt,
    seedHash: "DEMO-ONLY",
    serverSeed: "DEMO-ONLY",
    feeStatus: "demo",
    feeTxHash: null,
  };
  const prizeActivity: AppState["activity"][number] = {
    id: state.vault.ticketsSold + take + 1,
    type: "prize",
    user: user.username,
    amount: prize,
    at: drawnAt,
  };

  nextState = {
    ...nextState,
    user: finalUser,
    leaderboard: [
      {
        username: user.username,
        displayName: user.displayName,
        tickets: finalUser.tickets.length,
        won: (state.leaderboard.find((row) => row.username === user.username)?.won ?? 0) + prize,
      },
    ],
    round: {
      ...state.round,
      id: state.round.id + 1,
      sold: 0,
      remaining: state.round.capacity,
      seedHash: "DEMO-ONLY",
      tickets: [],
    },
    vault: {
      ...nextState.vault,
      balance: nextState.vault.balance + state.config.treasuryContributionPerRound,
      totalFees: nextState.vault.totalFees + state.config.treasuryContributionPerRound,
      totalPaid: nextState.vault.totalPaid + prize,
      roundsCompleted: nextState.vault.roundsCompleted + 1,
      adminEarnings: nextState.vault.adminEarnings + state.config.adminGrossRevenuePerRound,
    },
    winners: [history, ...nextState.winners].slice(0, 20),
    activity: [prizeActivity, ...nextState.activity].slice(0, 20),
  };
  return {
    state: nextState,
    serials,
    roundId: history.roundId,
    transactionReference: tickets[0]?.transactionReference ?? null,
    draw: result,
    error: null,
  };
}

function pickDemoSector() {
  const total = WHEEL_SECTORS.reduce((sum, sector) => sum + sector.weight, 0);
  let remaining = Math.floor(randomUnit() * total);
  for (let index = 0; index < WHEEL_SECTORS.length; index++) {
    remaining -= WHEEL_SECTORS[index].weight;
    if (remaining < 0) return index;
  }
  return 0;
}

export function spinDemoWheel(state: DemoAppState) {
  const user = state.user;
  if (!user) return { state, ok: false as const, error: "login" };
  if (user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > Date.now()) {
    return { state, ok: false as const, error: "excluded" };
  }
  const freeSpinReady = !user.nextSpinAt || new Date(user.nextSpinAt).getTime() <= Date.now();
  if (!freeSpinReady && user.bonusSpins < 1) return { state, ok: false as const, error: "spinTomorrow" };

  let index = pickDemoSector();
  const profit = Math.max(0, state.vault.balance - state.vault.initialCapital);
  if (WHEEL_SECTORS[index].value > profit) {
    index = WHEEL_SECTORS.findIndex((sector) => sector.value === 0.1);
  }
  const prize = profit >= WHEEL_SECTORS[index].value ? WHEEL_SECTORS[index].value : 0;
  const createdAt = new Date();
  const nextSpinAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const spinActivity: AppState["activity"][number] = {
    id: Date.now(),
    type: "prize",
    user: user.username,
    amount: prize,
    at: createdAt.toISOString(),
  };
  const nextState: DemoAppState = {
    ...state,
    user: {
      ...user,
      balance: user.balance + prize,
      bonusSpins: Math.max(0, user.bonusSpins - (freeSpinReady ? 0 : 1)),
      canSpin: false,
      nextSpinAt,
    },
    vault: { ...state.vault, balance: state.vault.balance - prize },
    activity: prize > 0 ? [spinActivity, ...state.activity].slice(0, 20) : state.activity,
  };
  return { state: nextState, ok: true as const, index, prize };
}

export function depositDemoBalance(state: DemoAppState, amount: number) {
  const user = state.user;
  if (!user || !Number.isFinite(amount) || amount <= 0 || amount > 500) return null;
  if (user.selfExcludedUntil && new Date(user.selfExcludedUntil).getTime() > Date.now()) return null;
  if (user.depositLimit !== null && user.totalDeposited + amount > user.depositLimit) return null;
  const createdAt = new Date().toISOString();
  return {
    ...state,
    user: {
      ...user,
      balance: user.balance + amount,
      totalDeposited: user.totalDeposited + amount,
      deposits: [
        {
          id: -Date.now(),
          amount,
          status: "finished",
          credited: true,
          provider: "demo",
          invoiceUrl: null,
          createdAt,
        },
        ...user.deposits,
      ].slice(0, 20),
    },
  } satisfies DemoAppState;
}

export function withdrawDemoBalance(state: DemoAppState, amount: number, address: string) {
  const user = state.user;
  if (!user || !Number.isFinite(amount) || amount < state.config.minWithdraw || amount > user.balance || !address.trim()) {
    return null;
  }
  const createdAt = new Date().toISOString();
  return {
    ...state,
    user: {
      ...user,
      balance: user.balance - amount,
      withdrawals: [
        {
          id: -Date.now(),
          amount,
          address: address.trim(),
          status: "pending",
          txHash: null,
          createdAt,
        },
        ...user.withdrawals,
      ].slice(0, 20),
    },
  } satisfies DemoAppState;
}


