export type AdminRole = "owner" | "compliance" | "finance" | "operator" | "auditor";

export type AdminPermission =
  | "tiers:read"
  | "tiers:write"
  | "rounds:read"
  | "rounds:draw"
  | "rounds:settle"
  | "reports:read"
  | "reconciliation:read"
  | "reconciliation:write"
  | "vault:read"
  | "vault:write"
  | "users:read"
  | "users:restrict"
  | "audit:read"
  | "audit:write"
  | "maintenance:write";

const ADMIN_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: [
    "tiers:read",
    "tiers:write",
    "rounds:read",
    "rounds:draw",
    "rounds:settle",
    "reports:read",
    "reconciliation:read",
    "reconciliation:write",
    "vault:read",
    "vault:write",
    "users:read",
    "users:restrict",
    "audit:read",
    "audit:write",
    "maintenance:write",
  ],
  compliance: [
    "tiers:read",
    "rounds:read",
    "reports:read",
    "users:read",
    "users:restrict",
    "audit:read",
  ],
  finance: [
    "tiers:read",
    "rounds:read",
    "reports:read",
    "reconciliation:read",
    "reconciliation:write",
    "vault:read",
    "vault:write",
    "audit:read",
  ],
  operator: ["tiers:read", "rounds:read", "rounds:draw", "rounds:settle", "reports:read", "audit:read"],
  auditor: ["tiers:read", "rounds:read", "reports:read", "reconciliation:read", "vault:read", "audit:read"],
};

export const ADMIN_ROLES = Object.keys(ADMIN_PERMISSIONS) as AdminRole[];

export function normalizeAdminRole(value: unknown): AdminRole | null {
  if (typeof value !== "string") return null;
  return ADMIN_ROLES.includes(value as AdminRole) ? (value as AdminRole) : null;
}

export function permissionsForRole(role: AdminRole): readonly AdminPermission[] {
  return ADMIN_PERMISSIONS[role];
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ADMIN_PERMISSIONS[role].includes(permission);
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

export function resolveLegacyAdminRole(token: string | undefined, expectedToken: string | undefined): AdminRole | null {
  if (!token || !expectedToken) return null;
  return safeEqual(token, expectedToken) ? "owner" : null;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashAdminToken(token: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${token}`);
}

export async function verifyAdminTokenHash(token: string, salt: string, expectedHash: string): Promise<boolean> {
  return safeEqual(await hashAdminToken(token, salt), expectedHash);
}

export interface AdminSessionRecord {
  role: string;
  expiresAt: number | string;
  revokedAt?: number | string | null;
  lastSeenAt?: number | string | null;
}

export interface AdminSessionDecision {
  valid: boolean;
  role: AdminRole | null;
  reason: "active" | "missing" | "invalid-role" | "revoked" | "expired";
}

function toTimestamp(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

export function evaluateAdminSession(session: AdminSessionRecord | null | undefined, nowMs = Date.now()): AdminSessionDecision {
  if (!session) return { valid: false, role: null, reason: "missing" };
  const role = normalizeAdminRole(session.role);
  if (!role) return { valid: false, role: null, reason: "invalid-role" };
  if (session.revokedAt != null) return { valid: false, role, reason: "revoked" };
  if (toTimestamp(session.expiresAt) <= nowMs) return { valid: false, role, reason: "expired" };
  return { valid: true, role, reason: "active" };
}

export function sessionHasPermission(
  session: AdminSessionRecord | null | undefined,
  permission: AdminPermission,
  nowMs = Date.now(),
): boolean {
  const decision = evaluateAdminSession(session, nowMs);
  return decision.valid && decision.role !== null && roleHasPermission(decision.role, permission);
}
