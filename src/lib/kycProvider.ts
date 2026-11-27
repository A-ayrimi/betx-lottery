import { KYC_LIFETIME_THRESHOLD_CENTS, KYC_TIER_TRIGGER } from "./complianceGuard.ts";

export type KycProviderMode = "simulator" | "external" | "fail-closed";

export interface KycProviderInput {
  status?: string | null;
  expiresAt?: string | Date | null;
  level?: string | number | null;
  tier?: number | null;
  lifetimeWithdrawalCents?: number | null;
  lifetimeVolumeCents?: number | null;
  nowMs?: number;
}

export interface KycProviderDecision {
  providerId: string;
  mode: KycProviderMode;
  required: boolean;
  approved: boolean;
  reasons: string[];
  checkedAt: string;
}

export interface KycProvider {
  readonly id: string;
  readonly mode: KycProviderMode;
  check(input: KycProviderInput): KycProviderDecision;
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function isExpired(expiresAt: string | Date | null | undefined, nowMs: number): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const parsed = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed <= nowMs;
}

export function kycRequirement(input: KycProviderInput): boolean {
  const tier = Number(input.tier ?? Number(input.level ?? 0));
  const withdrawals = Number(input.lifetimeWithdrawalCents ?? input.lifetimeVolumeCents ?? 0);
  return (
    (Number.isFinite(tier) && tier >= KYC_TIER_TRIGGER) ||
    (Number.isFinite(withdrawals) && withdrawals > KYC_LIFETIME_THRESHOLD_CENTS)
  );
}

export const failClosedKycProvider: KycProvider = {
  id: "fail-closed",
  mode: "fail-closed",
  check(input) {
    const nowMs = input.nowMs ?? Date.now();
    return {
      providerId: this.id,
      mode: this.mode,
      required: true,
      approved: false,
      reasons: ["kyc-provider-not-ready"],
      checkedAt: new Date(nowMs).toISOString(),
    };
  },
};

export function createSimulatedKycProvider(id = "simulated-kyc-v1"): KycProvider {
  return {
    id,
    mode: "simulator",
    check(input) {
      const nowMs = input.nowMs ?? Date.now();
      const required = kycRequirement(input);
      const status = normalizeStatus(input.status);
      const expired = isExpired(input.expiresAt, nowMs);
      const reasons: string[] = [];
      if (required && expired) reasons.push("kyc-expired");
      else if (required && status !== "approved") reasons.push("kyc-required");
      return {
        providerId: id,
        mode: "simulator",
        required,
        approved: !required || (status === "approved" && !expired),
        reasons,
        checkedAt: new Date(nowMs).toISOString(),
      };
    },
  };
}

export function resolveKycProvider(input: {
  live: boolean;
  external?: KycProvider | null;
}): KycProvider {
  if (input.live) return failClosedKycProvider;
  return input.external ?? createSimulatedKycProvider();
}
