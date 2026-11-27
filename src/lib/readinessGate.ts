export interface GateRow {
  id: number;
  status: string;
  note?: string;
}

export interface RuntimeGateFlags {
  maintenanceMode: boolean;
  paymentsEnabled: boolean;
  liveMode: boolean;
  vrfProviderReady: boolean;
  kycProviderReady: boolean;
  dbMigrationsApplied: boolean;
}

export interface ReadinessGateResult {
  ready: boolean;
  blockers: string[];
  passedRows: number[];
}

export const DEFAULT_RUNTIME_FLAGS: RuntimeGateFlags = {
  maintenanceMode: true,
  paymentsEnabled: false,
  liveMode: false,
  vrfProviderReady: false,
  kycProviderReady: false,
  dbMigrationsApplied: false,
};

export function isPassingStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("skip") || normalized.includes("pending") || normalized.includes("not started")) return false;
  if (normalized === "go") return true;
  if (normalized.startsWith("approved")) return true;
  if (normalized.startsWith("completed")) return true;
  if (normalized.startsWith("implemented")) return true;
  return normalized === "pass" || normalized === "done" || normalized.endsWith("pass");
}

export function evaluateReadinessGate(
  rows: readonly GateRow[],
  runtime: RuntimeGateFlags = DEFAULT_RUNTIME_FLAGS,
): ReadinessGateResult {
  const blockers: string[] = [];
  const passedRows: number[] = [];

  for (let id = 1; id <= 18; id += 1) {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) {
      blockers.push(`row-${id}-missing`);
      continue;
    }
    if (!isPassingStatus(row.status)) blockers.push(`row-${id}-${row.status || "empty"}`);
    else passedRows.push(id);
  }

  const ownerGate = rows.find((row) => row.id === 19);
  if (!ownerGate || ownerGate.status.trim().toLowerCase() !== "go") blockers.push("row-19-no-go");

  if (!runtime.dbMigrationsApplied) blockers.push("db-migrations-not-applied");
  if (!runtime.vrfProviderReady) blockers.push("vrf-provider-not-ready");
  if (!runtime.kycProviderReady) blockers.push("kyc-provider-not-ready");
  if (runtime.maintenanceMode) blockers.push("maintenance-enabled");
  if (!runtime.paymentsEnabled) blockers.push("payments-disabled");
  if (!runtime.liveMode) blockers.push("live-mode-disabled");

  return { ready: blockers.length === 0, blockers, passedRows };
}
