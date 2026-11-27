import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";

export type AdminRole = "ADMIN" | "VIEWER";

export interface AdminActor {
  role: AdminRole;
  actor: string;
  roleSnapshot: "owner" | "auditor";
  operatorRef: string;
  sessionRef: string;
}

function tokenMatches(got: string, expected: string): boolean {
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function buildAdminActor(role: AdminRole, token: string): AdminActor {
  const roleSnapshot = role === "ADMIN" ? "owner" : "auditor";
  const fingerprint = tokenFingerprint(token);
  return {
    role,
    actor: `${roleSnapshot}:${fingerprint}`,
    roleSnapshot,
    operatorRef: `operator:${roleSnapshot}:${fingerprint}`,
    sessionRef: `session:${roleSnapshot}:${fingerprint}`,
  };
}

export function getAdminRole(req: NextRequest): AdminRole | null {
  const got = req.headers.get("x-admin-token") || "";
  if (tokenMatches(got, config.adminToken)) return "ADMIN";
  if (tokenMatches(got, config.adminViewerToken)) return "VIEWER";
  return null;
}

export function getAdminActor(req: NextRequest): AdminActor | null {
  const got = req.headers.get("x-admin-token") || "";
  if (tokenMatches(got, config.adminToken)) return buildAdminActor("ADMIN", got);
  if (tokenMatches(got, config.adminViewerToken)) return buildAdminActor("VIEWER", got);
  return null;
}

export function requireAdminRole(req: NextRequest, roles: readonly AdminRole[]): AdminActor | null {
  const actor = getAdminActor(req);
  return actor && roles.includes(actor.role) ? actor : null;
}

export function isAdmin(req: NextRequest) {
  return getAdminRole(req) === "ADMIN";
}
