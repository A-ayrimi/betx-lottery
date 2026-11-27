import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { UserError } from "@/lib/store";
import { shouldFailOpenRateLimit } from "@/lib/rateLimitFailOpen";

/**
 * Fixed-window rate limiter stored in Postgres, so it holds across all
 * serverless instances. Throws a localized 429 when the budget is spent.
 */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim().slice(0, 64);
}

export async function rateLimit(bucket: string, id: string | number, limit: number, windowSec = 60) {
  const windowStart = new Date(Math.floor(Date.now() / (windowSec * 1000)) * windowSec * 1000);
  try {
    const rows = await db
      .insert(rateLimits)
      .values({ key: `${bucket}:${id}`, windowStart, count: 1 })
      .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    if ((rows[0]?.count ?? 0) > limit) throw new UserError("rateLimited", 429);
  } catch (error) {
    if (shouldFailOpenRateLimit(error)) return;
    throw error;
  }
}

/** Per-IP limit for anonymous endpoints. */
export async function limitByIp(bucket: string, limit: number, windowSec = 60) {
  return rateLimit(bucket, await clientIp(), limit, windowSec);
}
