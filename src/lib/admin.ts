import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";

export type AdminRole = "ADMIN" | "VIEWER";

function tokenMatches(got: string, expected: string): boolean {
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getAdminRole(req: NextRequest): AdminRole | null {
  const got = req.headers.get("x-admin-token") || "";
  if (tokenMatches(got, config.adminToken)) return "ADMIN";
  if (tokenMatches(got, config.adminViewerToken)) return "VIEWER";
  return null;
}

export function requireAdminRole(req: NextRequest, roles: readonly AdminRole[]) {
  const role = getAdminRole(req);
  return role && roles.includes(role) ? { role, actor: role.toLowerCase() } : null;
}

export function isAdmin(req: NextRequest) {
  return getAdminRole(req) === "ADMIN";
}
