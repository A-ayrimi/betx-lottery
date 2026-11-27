import { createHash } from "node:crypto";
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

const postgresConfig = buildPostgresConfig(databaseUrl);
const configKey = createHash("sha256").update(JSON.stringify(postgresConfig)).digest("hex");

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlPoolConfigKey?: string;
};

const cachedPool = globalForDb.__arenaNextJsPostgresqlPool;
const configChanged = globalForDb.__arenaNextJsPostgresqlPoolConfigKey !== configKey;

export const pool =
  cachedPool && !configChanged ? cachedPool : new Pool(postgresConfig);

globalForDb.__arenaNextJsPostgresqlPool = pool;
globalForDb.__arenaNextJsPostgresqlPoolConfigKey = configKey;

pool.on("error", (error) => {
  if (process.env.NODE_ENV === "production") console.error("PostgreSQL idle client error", error);
});

export const db = drizzle(pool);
