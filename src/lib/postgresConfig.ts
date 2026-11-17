export function buildPostgresConfig(url: string, env: NodeJS.ProcessEnv = process.env) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!isLocal && env.DATABASE_SSL?.toLowerCase() === "false") {
    throw new Error("Remote PostgreSQL connections require verified TLS");
  }

  if (parsed.searchParams.has("sslcert") || parsed.searchParams.has("sslkey")) {
    throw new Error("PostgreSQL client certificates must be configured outside DATABASE_URL");
  }
  if (parsed.searchParams.has("sslrootcert") && !env.DATABASE_SSL_CA) {
    throw new Error("Set DATABASE_SSL_CA instead of sslrootcert in DATABASE_URL");
  }

  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("sslrootcert");
  const useTls = !isLocal || env.DATABASE_SSL === "true" || Boolean(env.DATABASE_SSL_CA);

  return {
    connectionString: parsed.toString(),
    ssl: useTls
      ? {
          rejectUnauthorized: true as const,
          ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}),
        }
      : undefined,
    max: Number(env.DATABASE_POOL_MAX || (env.VERCEL ? 3 : 10)),
    idleTimeoutMillis: 10_000,
  };
}
