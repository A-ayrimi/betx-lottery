import { canonicalize } from "./auditChain.ts";
import { sha256Hex } from "./adminRbac.ts";

export interface IntegrityProofInput {
  roundId: string;
  ticketSnapshotHash: string;
  drawProofHash: string;
  settlementHash: string;
  vaultAllocationHash: string;
  auditHeadHash: string;
  stateVersion: number;
}

export interface IntegrityProof extends IntegrityProofInput {
  hash: string;
  createdAt: string;
}

export async function computeIntegrityHash(input: IntegrityProofInput): Promise<string> {
  return sha256Hex(canonicalize(input));
}

export async function buildIntegrityProof(input: IntegrityProofInput, nowMs = Date.now()): Promise<IntegrityProof> {
  return {
    ...input,
    hash: await computeIntegrityHash(input),
    createdAt: new Date(nowMs).toISOString(),
  };
}

export async function verifyIntegrityProof(proof: IntegrityProof): Promise<boolean> {
  return (await sha256Hex(canonicalize({
    roundId: proof.roundId,
    ticketSnapshotHash: proof.ticketSnapshotHash,
    drawProofHash: proof.drawProofHash,
    settlementHash: proof.settlementHash,
    vaultAllocationHash: proof.vaultAllocationHash,
    auditHeadHash: proof.auditHeadHash,
    stateVersion: proof.stateVersion,
  }))) === proof.hash;
}

export interface IntegrityInvariants {
  winnerCount: number;
  distinctWinnerCount: number;
  referralBeforeSettlement: boolean;
  growthCents: number;
  jackpotCents: number;
  grossCents: number;
  blockedGeoAllowed: boolean;
  maintenanceDisabled: boolean;
  paymentsEnabled: boolean;
}

export function evaluateIntegrityInvariants(input: IntegrityInvariants): string[] {
  const violations: string[] = [];
  if (input.winnerCount !== 1) violations.push("winner-count");
  if (input.distinctWinnerCount !== 1) violations.push("duplicate-winners");
  if (input.referralBeforeSettlement) violations.push("referral-before-settlement");
  if (input.growthCents + input.jackpotCents !== input.grossCents) violations.push("vault-split");
  if (input.blockedGeoAllowed) violations.push("blocked-geo");
  if (!input.maintenanceDisabled) violations.push("maintenance-off");
  if (!input.paymentsEnabled) violations.push("payments-off");
  return violations;
}
