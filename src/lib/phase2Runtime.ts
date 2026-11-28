import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditEvents, drawCommitments, drawReveals, integrityProofs } from "@/db/schema";
import { AUDIT_GENESIS_HASH, auditHead, canonicalize, nextAuditEvent, verifyAuditChain, type AuditEventRecord } from "@/lib/auditChain";
import { buildIntegrityProof, verifyIntegrityProof } from "@/lib/integrityProof";
import { buildPhase2SettlementPlan, derivePhase2Draw, type Phase2DrawInput, type Phase2SettlementInput } from "@/lib/phase2Policy";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function roleSnapshotFromActor(actor: string): string {
  if (actor.startsWith("owner:")) return "owner";
  if (actor.startsWith("auditor:")) return "auditor";
  if (actor.startsWith("admin:")) return "owner";
  return "owner";
}

function operatorRefFromActor(actor: string): string {
  if (actor.includes(":")) return `operator:${actor}`;
  return `operator:owner:${actor}`;
}

function sessionRefFromActor(actor: string): string {
  if (actor.includes(":")) return `session:${actor}`;
  return `session:owner:${actor}`;
}

export async function appendAdminAuditEvent(
  tx: Tx,
  input: {
    actor: string;
    action: string;
    subject: string;
    metadata: unknown;
    roleSnapshot?: string;
    requestId?: string;
  },
) {
  const previous = (
    await tx
      .select({ eventHash: adminAuditEvents.eventHash })
      .from(adminAuditEvents)
      .orderBy(desc(adminAuditEvents.id))
      .limit(1)
  )[0];
  const event = await nextAuditEvent(
    {
      eventType: "admin",
      actor: input.actor,
      action: input.action,
      subject: input.subject,
      metadata: input.metadata,
      createdAt: Date.now(),
    },
    previous?.eventHash ?? AUDIT_GENESIS_HASH,
  );
  const roleSnapshot = input.roleSnapshot ?? roleSnapshotFromActor(input.actor);
  const operatorRef = operatorRefFromActor(input.actor);
  const sessionRef = sessionRefFromActor(input.actor);
  await tx.insert(adminAuditEvents).values({
    operatorId: null,
    roleSnapshot,
    requestId: input.requestId ?? null,
    action: event.action,
    resource: event.subject,
    beforeHash: event.previousHash,
    eventHash: event.hash,
    details: {
      eventType: event.eventType,
      actor: event.actor,
      operatorRef,
      sessionRef,
      roleSnapshot,
      subject: event.subject,
      metadata: event.metadata,
      createdAt: event.createdAt,
    },
  });
  return event;
}

export async function listAdminAuditChain(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 100));
  const rows = await db
    .select()
    .from(adminAuditEvents)
    .orderBy(desc(adminAuditEvents.id))
    .limit(safeLimit);
  const events: (AuditEventRecord & { operatorRef: string; sessionRef: string; roleSnapshot: string })[] = rows
    .reverse()
    .map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        previousHash: row.beforeHash ?? AUDIT_GENESIS_HASH,
        hash: row.eventHash,
        createdAt: new Date(row.createdAt).toISOString(),
        eventType: String(details.eventType ?? "admin"),
        actor: String(details.actor ?? "unknown"),
        operatorRef: String(details.operatorRef ?? ""),
        sessionRef: String(details.sessionRef ?? ""),
        roleSnapshot: String(details.roleSnapshot ?? row.roleSnapshot ?? ""),
        action: row.action,
        subject: row.resource,
        metadata: details.metadata ?? null,
      };
    });
  return { valid: await verifyAuditChain(events), head: auditHead(events), entries: events };
}

export async function writePhase2DrawEvidence(
  tx: Tx,
  input: Phase2DrawInput,
): Promise<{ proofHash: string; ticketSnapshotHash: string; winnerIndices: number[] } | null> {
  const commitment = (
    await tx
      .select({ id: drawCommitments.id })
      .from(drawCommitments)
      .where(eq(drawCommitments.roundId, input.roundId))
      .limit(1)
  )[0];
  if (!commitment) return null;
  const result = await derivePhase2Draw(input);
  for (let place = 1; place <= result.indices.length; place += 1) {
    const ticket = input.tickets[result.indices[place - 1]];
    await tx
      .insert(drawReveals)
      .values({
        commitmentId: commitment.id,
        roundId: input.roundId,
        place,
        nonce: place - 1,
        serverSeed: input.serverSeed,
        clientSeed: "committed-server-seed",
        proofPayload: {
          proof: result.proof,
          proofHash: result.proofHash,
          ticketSnapshotHash: result.ticketSnapshotHash,
          ticketId: ticket.id,
          userId: ticket.userId,
          serial: ticket.ticketSerial,
          status: "EVIDENCE_ONLY",
        },
      })
      .onConflictDoNothing();
  }
  return {
    proofHash: result.proofHash,
    ticketSnapshotHash: result.ticketSnapshotHash,
    winnerIndices: result.indices,
  };
}

export async function writePhase2SettlementProof(
  tx: Tx,
  input: {
    roundId: number;
    plan: Phase2SettlementInput;
    drawProofHash: string;
    ticketSnapshotHash: string;
    auditHeadHash: string;
  },
) {
  const plan = buildPhase2SettlementPlan(input.plan);
  const settlementHash = digest({ roundId: input.roundId, plan });
  const vaultAllocationHash = digest(plan.vault);
  const proof = await buildIntegrityProof({
    roundId: String(input.roundId),
    ticketSnapshotHash: input.ticketSnapshotHash,
    drawProofHash: input.drawProofHash,
    settlementHash,
    vaultAllocationHash,
    auditHeadHash: input.auditHeadHash,
    stateVersion: 1,
  });
  const verified = await verifyIntegrityProof(proof);
  await tx.insert(integrityProofs).values({
    scope: "round-settlement",
    subjectId: String(input.roundId),
    result: verified ? "PLANNED" : "BLOCKED",
    blockedReason: verified ? null : "integrity-proof-mismatch",
    payload: { plan, proof },
    hash: proof.hash,
  });
  return { verified, hash: proof.hash };
}

export async function getPhase2ProofSummary(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const rows = await db
    .select({
      scope: integrityProofs.scope,
      subjectId: integrityProofs.subjectId,
      result: integrityProofs.result,
      hash: integrityProofs.hash,
      createdAt: integrityProofs.createdAt,
    })
    .from(integrityProofs)
    .orderBy(desc(integrityProofs.createdAt))
    .limit(safeLimit);
  return rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
}
