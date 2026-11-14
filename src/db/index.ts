import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/**
 * Hosted Postgres (Supabase / Neon) needs TLS. Their certificate chains are not
 * in Node's default trust store, so we strip `sslmode` from the URL (it would
 * otherwise force verify-full) and enable TLS explicitly.
 */
function buildConfig(url: string) {
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url);
  const wantSsl =
    process.env.DATABASE_SSL === "true" ||
    (!isLocal && process.env.DATABASE_SSL !== "false");

  let connectionString = url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
  } catch {
    /* keep raw string */
  }

  return {
    connectionString,
    ssl: wantSsl ? { rejectUnauthorized: false } : undefined,
    // serverless functions: keep the pool tiny, let the pooler do the work
    max: Number(process.env.DATABASE_POOL_MAX || (process.env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
  };
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ?? new Pool(buildConfig(databaseUrl));

globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
