import { publicConfig } from "./config.ts";
import {
  createPreviewState,
  previewProgress as previewTierProgress,
  previewTicketsForTier,
} from "./demoSession.ts";
import { previewVaultCandles } from "./previewCandles.ts";
import type { TicketLookupRow } from "./ticketLookup.ts";
import type { AppState } from "./types.ts";

function isDatabaseTestUi(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.BETX_TEST_DATABASE_UI === "true"
  );
}

export function isNonLivePreview(): boolean {
  try {
    return !publicConfig().live && !isDatabaseTestUi();
  } catch {
    return false;
  }
}

export function isPreviewFallbackEnabled(): boolean {
  try {
    return !publicConfig().live;
  } catch {
    return false;
  }
}

export function previewState(nowMs = Date.now()) {
  return createPreviewState("en", nowMs);
}

export function previewProgress(nowMs = Date.now()) {
  return previewTierProgress(nowMs);
}

export function previewRoundState(tierCode?: string, nowMs = Date.now()) {
  const state = createPreviewState("en", nowMs);
  const tiers = state.tiers;
  const tier = tierCode
    ? tiers.find((item) => item.code === tierCode) ?? tiers[0]
    : tiers[0];
  const candles = state.candles.length ? state.candles : previewVaultCandles("24h", nowMs);
  if (!tier) return { round: null, tiers, candles };

  const sold = previewProgress(nowMs).find((item) => item.code === tier.code)?.sold ?? 0;
  return {
    candles,
    round: {
      ...state.round,
      candles,
      id: tier.id,
      tierId: tier.id,
      tierCode: tier.code,
      capacity: tier.capacity,
      sold,
      remaining: Math.max(0, tier.capacity - sold),
      prize: tier.prize,
      fee: tier.treasury + tier.admin,
      treasuryContribution: tier.treasury,
      adminGrossRevenue: tier.admin,
      tickets: previewTicketsForTier(tier.code, sold),
    },
    tiers,
  };
}

export function withPreviewFallback(state: AppState | null) {
  if (!isPreviewFallbackEnabled()) return state;
  const preview = previewState();
  if (!state || !state.round || !Array.isArray(state.tiers) || state.tiers.length === 0) return preview;
  return {
    ...state,
    winners: state.winners?.length ? state.winners : preview.winners,
    activity: state.activity?.length ? state.activity : preview.activity,
    stats:
      state.stats?.players || state.stats?.ticketsLast24
        ? state.stats
        : preview.stats,
  };
}

export function previewTicketBySerial(serial: string, nowMs = Date.now()): TicketLookupRow | null {
  const state = previewState(nowMs);
  for (const tier of state.tiers) {
    const round = previewRoundState(tier.code, nowMs).round;
    const ticket = round?.tickets.find((item) => item.serial === serial);
    if (!round || !ticket) continue;
    return {
      serial,
      roundId: round.id,
      roundStatus: round.status ?? "OPEN",
      ticketStatus: "pending",
      tierCode: tier.code,
      tierName: tier.name,
      username: ticket.username,
      walletAddress: null,
      transactionSignature: null,
      createdAt: new Date(nowMs).toISOString(),
      winningSerial: null,
      prize: 0,
      seedHash: round.seedHash,
    };
  }
  return null;
}
