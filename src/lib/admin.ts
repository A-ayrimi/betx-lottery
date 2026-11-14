import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { config } from "@/lib/config";

export function isAdmin(req: NextRequest) {
  const expected = config.adminToken;
  if (!expected || expected.length < 16) return false;
  const got = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("key") || "";
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
