import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getBetxMode } from "@/lib/config";
import { assertDatabaseTarget } from "@/lib/dbSafety";
import { buildPostgresConfig } from "@/lib/postgresConfig";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const mode = getBetxMode();
assertDatabaseTarget(mode, databaseUrl, process.env.NODE_ENV);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ?? new Pool(buildPostgresConfig(databaseUrl));

globalForDb.__arenaNextJsPostgresqlPool = pool;

export const db = drizzle(pool);
