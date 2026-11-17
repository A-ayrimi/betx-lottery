export function assertDatabaseTarget(mode: string, databaseUrl: string, nodeEnv = "") {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use PostgreSQL");
  }

  const host = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (mode === "demo" && !localHosts.has(host)) {
    throw new Error("Demo mode requires a local database; refusing a remote database URL");
  }
  if (nodeEnv === "test" && !localHosts.has(host)) {
    throw new Error("Tests require a local database; refusing a remote database URL");
  }
}
