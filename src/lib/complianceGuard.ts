export const APPROVED_BLOCKED_JURISDICTIONS: readonly string[] = [
  "US",
  "KP",
  "IR",
  "SY",
  "CU",
  "RU",
  "BY",
  "MM",
  "AF",
];

export const KYC_LIFETIME_THRESHOLD_CENTS = 50000;
export const MINIMUM_AGE = 18;
export const KYC_TIER_TRIGGER = 6;

export type KycStatus = "none" | "pending" | "approved" | "rejected" | "expired";

export interface ComplianceInput {
  countryCode?: string | null;
  birthDate?: string | null;
  age?: number | null;
  kycStatus?: KycStatus | null;
  lifetimeVolumeCents?: number | null;
  tier?: number | null;
  nowMs?: number;
}

export interface ComplianceDecision {
  allowed: boolean;
  reasons: string[];
  requiredActions: string[];
}

function calculateAge(birthDate: string, nowMs: number): number | null {
  const parsed = Date.parse(birthDate);
  if (!Number.isFinite(parsed)) return null;
  const birth = new Date(parsed);
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function evaluateCompliance(input: ComplianceInput): ComplianceDecision {
  const reasons: string[] = [];
  const requiredActions: string[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const country = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";

  if (!country) {
    reasons.push("geo-missing");
  } else if (APPROVED_BLOCKED_JURISDICTIONS.includes(country)) {
    reasons.push("geo-blocked");
  }

  const age = input.birthDate ? calculateAge(input.birthDate, nowMs) : input.age ?? null;
  if (age === null || !Number.isFinite(age)) {
    reasons.push("age-missing");
    requiredActions.push("verify-age-server-side");
  } else if (age < MINIMUM_AGE) {
    reasons.push("underage");
  }

  const tier = input.tier ?? 0;
  const lifetime = input.lifetimeVolumeCents ?? 0;
  const kycNeeded = tier >= KYC_TIER_TRIGGER || lifetime > KYC_LIFETIME_THRESHOLD_CENTS;
  if (kycNeeded && input.kycStatus !== "approved") {
    reasons.push("kyc-required");
    requiredActions.push("complete-kyc");
  }

  return { allowed: reasons.length === 0, reasons, requiredActions };
}

export function readCountryFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const candidates = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code", "x-geo-country"];
  for (const key of candidates) {
    const value = headers[key];
    const country = Array.isArray(value) ? value[0] : value;
    if (typeof country === "string" && country.trim().length > 0) return country.trim().toUpperCase();
  }
  return null;
}

export function isLiveMode(environment: Record<string, string | undefined> = process.env): boolean {
  const value = environment.LIVE_MODE ?? environment.NEXT_PUBLIC_LIVE_MODE ?? "false";
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on";
}

export function isGeoEnforcementRequired(environment: Record<string, string | undefined> = process.env): boolean {
  if (isLiveMode(environment)) return true;
  const value = environment.GEO_BLOCK ?? "off";
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "on";
}
