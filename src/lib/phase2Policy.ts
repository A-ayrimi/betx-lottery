import type { AdminPermission, AdminRole } from "./adminRbac.ts";
import { roleHasPermission } from "./adminRbac.ts";
import {
  evaluateCompliance,
  isGeoEnforcementRequired,
  isLiveMode,
  readCountryFromHeaders,
  type ComplianceDecision,
  type KycStatus,
} from "./complianceGuard.ts";
import {
  createReplayableVrfProvider,
  drawDistinctWinners,
  failClosedVrfProvider,
  hashTicketSnapshot,
  hashVrfProof,
  type ReplayableVrfProvider,
  type VrfProof,
} from "./drawRandomness.ts";
import { resolveKycProvider, type KycProvider, type KycProviderDecision, type KycProviderInput } from "./kycProvider.ts";
import { REFUND_WINDOW_MS, evaluateRefundEligibility, type RefundPoolState } from "./refundRollover.ts";
import { DEFAULT_RUNTIME_FLAGS, evaluateReadinessGate, type GateRow } from "./readinessGate.ts";
import { CONSOLATION_REWARDS, weeklyJackpotSplit } from "./rewardEngine.ts";
import { allocateVault, computeReferralCommission } from "./vaultAccounts.ts";

export { REFUND_WINDOW_MS };

export type LegacyAdminRole = "ADMIN" | "VIEWER" | null | undefined;

export function mapLegacyAdminRole(role: LegacyAdminRole): AdminRole | null {
  if (role === "ADMIN") return "owner";
  if (role === "VIEWER") return "auditor";
  return null;
}

export function assertLegacyPermission(role: LegacyAdminRole, permission: AdminPermission): boolean {
  const mapped = mapLegacyAdminRole(role);
  return mapped !== null && roleHasPermission(mapped, permission);
}

export const PHASE2_CHECKLIST_ROWS: readonly GateRow[] = [
  { id: 1, status: "APPROVED" },
  { id: 2, status: "APPROVED" },
  { id: 3, status: "APPROVED — BASE LIST" },
  { id: 4, status: "APPROVED — MODULAR INTERFACE" },
  { id: 5, status: "COMPLETED (SNAPSHOT)" },
  { id: 6, status: "COMPLETED" },
  { id: 7, status: "IMPLEMENTED — DB RUN PASS" },
  { id: 8, status: "STATIC + DB PARITY PASS" },
  { id: 9, status: "COMPLETED" },
  { id: 10, status: "IMPLEMENTED — WIRED" },
  { id: 11, status: "IMPLEMENTED — REPLAYABLE ADAPTER" },
  { id: 12, status: "IMPLEMENTED — WIRED" },
  { id: 13, status: "IMPLEMENTED — WIRED" },
  { id: 14, status: "IMPLEMENTED — KYC ADAPTER" },
  { id: 15, status: "IMPLEMENTED — WIRED" },
  { id: 16, status: "IMPLEMENTED — VERIFIED" },
  { id: 17, status: "IMPLEMENTED — ADAPTERS + ACTOR BOUND" },
  { id: 18, status: "COMPLETED — RESTORE VERIFIED" },
  { id: 19, status: "NO-GO / PENDING OWNER DECISION" },
];

export function phase2Readiness() {
  return evaluateReadinessGate(PHASE2_CHECKLIST_ROWS, DEFAULT_RUNTIME_FLAGS);
}

export interface Phase2DrawInput {
  roundId: number;
  serverSeed: string;
  tickets: readonly { id: number; userId: number; ticketSerial: string; tierId?: number }[];
  live: boolean;
  winnerCount?: number;
}

export interface Phase2DrawResult {
  indices: number[];
  proof: VrfProof;
  proofHash: string;
  ticketSnapshotHash: string;
}

export async function derivePhase2Draw(input: Phase2DrawInput): Promise<Phase2DrawResult> {
  const snapshotHash = await hashTicketSnapshot(
    input.tickets.map((ticket) => ({ id: String(ticket.id), userId: String(ticket.userId), tier: ticket.tierId ?? 1 })),
  );
  const provider = input.live
    ? failClosedVrfProvider
    : createReplayableVrfProvider({ id: "replayable-hmac-v1", secret: input.serverSeed });
  const proof: VrfProof = input.live
    ? {
        providerId: failClosedVrfProvider.id,
        roundId: String(input.roundId),
        seed: input.serverSeed,
        nonce: "0",
        signature: "",
        publicKey: "fail-closed",
        ticketSnapshotHash: snapshotHash,
      }
    : await (provider as ReplayableVrfProvider).issueProof({
        roundId: input.roundId,
        seed: input.serverSeed,
        ticketSnapshotHash: snapshotHash,
      });
  const indices = await drawDistinctWinners(provider, proof, input.tickets.length, input.winnerCount ?? 1);
  return { indices, proof, proofHash: await hashVrfProof(proof), ticketSnapshotHash: snapshotHash };
}

export interface Phase2SettlementInput {
  grossUsd: number;
  ticketCount: number;
  winnerCount?: number;
  settled: boolean;
  directReferral: boolean;
  kycApproved: boolean;
  refunded: boolean;
}

export function buildPhase2SettlementPlan(input: Phase2SettlementInput) {
  const grossCents = Math.round(input.grossUsd * 100);
  const vault = allocateVault(grossCents);
  const referral = computeReferralCommission({
    grossCents,
    settled: input.settled,
    directReferral: input.directReferral,
    kycApproved: input.kycApproved,
    refunded: input.refunded,
  });
  const winnerCount = input.winnerCount ?? 1;
  return {
    grossCents,
    vault,
    referral,
    consolationSlots: Math.max(0, input.ticketCount - winnerCount),
    consolationTable: CONSOLATION_REWARDS.map((reward) => ({ ...reward })),
    jackpot: weeklyJackpotSplit(vault.jackpotCents),
    refundWindowMs: REFUND_WINDOW_MS,
  };
}

export function evaluatePhase2Refund(pool: RefundPoolState, nowMs?: number) {
  return evaluateRefundEligibility(pool, nowMs);
}

export interface SensitiveComplianceInput {
  countryCode?: string | null;
  birthDate?: string | null;
  ageStatus?: string | null;
  ageVerifiedAt?: string | null;
  kycStatus?: string | null;
  kycExpiresAt?: string | null;
  totalDepositedUsd?: number | string | null;
  lifetimeWithdrawalUsd?: number | string | null;
  tier?: number | null;
  nowMs?: number;
}

function normalizeKycStatus(status: string | null | undefined, expiresAt: string | null | undefined, nowMs: number): KycStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "approved") {
    if (expiresAt && Date.parse(expiresAt) <= nowMs) return "expired";
    return "approved";
  }
  if (normalized === "pending" || normalized === "in_review" || normalized === "review") return "pending";
  if (normalized === "rejected" || normalized === "denied") return "rejected";
  if (normalized === "expired") return "expired";
  return "none";
}

export function evaluateSensitiveCompliance(input: SensitiveComplianceInput): ComplianceDecision {
  const nowMs = input.nowMs ?? Date.now();
  const ageVerified = ["VERIFIED", "APPROVED"].includes((input.ageStatus ?? "").trim().toUpperCase());
  const birthDate = ageVerified && input.ageVerifiedAt ? input.birthDate : null;
  const deposited = Number(input.totalDepositedUsd ?? 0);
  const withdrawn = Number(input.lifetimeWithdrawalUsd ?? 0);
  const total = (Number.isFinite(deposited) ? deposited : 0) + (Number.isFinite(withdrawn) ? withdrawn : 0);
  return evaluateCompliance({
    countryCode: input.countryCode,
    birthDate,
    kycStatus: normalizeKycStatus(input.kycStatus, input.kycExpiresAt, nowMs),
    lifetimeVolumeCents: Math.round(total * 100),
    tier: input.tier ?? 0,
    nowMs,
  });
}

export interface ComplianceUserInput {
  countryCode?: string | null;
  birthDate?: string | Date | null;
  ageStatus?: string | null;
  ageVerifiedAt?: string | Date | null;
  kycStatus?: string | null;
  kycExpiresAt?: string | Date | null;
  totalDepositedUsd?: number | string | null;
  lifetimeWithdrawalUsd?: number | string | null;
  kycLevel?: string | number | null;
  nowMs?: number;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function evaluateUserCompliance(input: ComplianceUserInput): ComplianceDecision {
  const tier = Number(input.kycLevel ?? 0);
  return evaluateSensitiveCompliance({
    countryCode: input.countryCode,
    birthDate: toIsoString(input.birthDate) ?? undefined,
    ageStatus: input.ageStatus,
    ageVerifiedAt: toIsoString(input.ageVerifiedAt) ?? undefined,
    kycStatus: input.kycStatus,
    kycExpiresAt: toIsoString(input.kycExpiresAt) ?? undefined,
    totalDepositedUsd: input.totalDepositedUsd,
    lifetimeWithdrawalUsd: input.lifetimeWithdrawalUsd,
    tier: Number.isFinite(tier) ? tier : 0,
    nowMs: input.nowMs,
  });
}

function toCents(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function evaluateKycProviderGate(
  input: ComplianceUserInput,
  environment: Record<string, string | undefined> = process.env,
  external?: KycProvider | null,
): KycProviderDecision {
  const tier = Number(input.kycLevel ?? 0);
  return resolveKycProvider({ live: isLiveMode(environment), external }).check({
    status: input.kycStatus,
    expiresAt: toIsoString(input.kycExpiresAt) ?? undefined,
    level: input.kycLevel,
    tier: Number.isFinite(tier) ? tier : 0,
    lifetimeWithdrawalCents: toCents(input.lifetimeWithdrawalUsd),
    lifetimeVolumeCents: toCents(input.totalDepositedUsd),
    nowMs: input.nowMs,
  });
}

export interface SensitiveActionDecision extends ComplianceDecision {
  strict: boolean;
  enforceGeo: boolean;
  kycProvider: KycProviderDecision;
}

const COUNTRY_HEADER_KEYS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code", "x-geo-country"] as const;

export function assessSensitiveAction(
  user: ComplianceUserInput,
  headers?: Headers | null,
  environment: Record<string, string | undefined> = process.env,
): SensitiveActionDecision {
  const headerMap: Record<string, string | string[] | undefined> = {};
  if (headers) {
    for (const key of COUNTRY_HEADER_KEYS) {
      const value = headers.get(key);
      if (value) headerMap[key] = value;
    }
  }
  const decision = evaluateUserCompliance({
    ...user,
    countryCode: readCountryFromHeaders(headerMap) ?? user.countryCode ?? null,
  });
  const strict = isLiveMode(environment);
  const enforceGeo = isGeoEnforcementRequired(environment);
  const kycProvider = evaluateKycProviderGate(user, environment);
  const kycProviderBlocked = strict && kycProvider.required && !kycProvider.approved;
  const reasons = strict
    ? [...decision.reasons, ...(kycProviderBlocked ? kycProvider.reasons.filter((reason) => !decision.reasons.includes(reason)) : [])]
    : decision.reasons.filter((reason) => enforceGeo && reason.startsWith("geo-"));
  return {
    allowed: reasons.length === 0,
    reasons,
    requiredActions: strict
      ? [...decision.requiredActions, ...(kycProviderBlocked && !decision.requiredActions.includes("connect-kyc-provider") ? ["connect-kyc-provider"] : [])]
      : [],
    strict,
    enforceGeo,
    kycProvider,
  };
}
