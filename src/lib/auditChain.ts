import { sha256Hex } from "./adminRbac.ts";

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export interface AuditEventInput {
  eventType: string;
  actor: string;
  action: string;
  subject: string;
  metadata?: unknown;
  createdAt?: number | string;
}

export interface AuditEventRecord {
  id?: string;
  previousHash: string;
  hash: string;
  createdAt: string;
  eventType: string;
  actor: string;
  action: string;
  subject: string;
  metadata: unknown;
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function normalizeCreatedAt(createdAt: number | string | undefined): string {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return new Date(createdAt).toISOString();
  if (typeof createdAt === "string" && createdAt.length > 0) return createdAt;
  return new Date(0).toISOString();
}

export async function computeAuditHash(input: {
  previousHash: string;
  eventType: string;
  actor: string;
  action: string;
  subject: string;
  metadata: unknown;
  createdAt: string;
}): Promise<string> {
  return sha256Hex(canonicalize(input));
}

export async function nextAuditEvent(input: AuditEventInput, previousHash: string = AUDIT_GENESIS_HASH): Promise<AuditEventRecord> {
  const createdAt = normalizeCreatedAt(input.createdAt);
  const payload = {
    previousHash,
    eventType: input.eventType,
    actor: input.actor,
    action: input.action,
    subject: input.subject,
    metadata: input.metadata ?? null,
    createdAt,
  };
  return {
    ...payload,
    hash: await computeAuditHash(payload),
  };
}

export async function verifyAuditChain(events: readonly AuditEventRecord[]): Promise<boolean> {
  let previousHash = AUDIT_GENESIS_HASH;
  for (const event of events) {
    if (event.previousHash !== previousHash) return false;
    const expected = await computeAuditHash({
      previousHash,
      eventType: event.eventType,
      actor: event.actor,
      action: event.action,
      subject: event.subject,
      metadata: event.metadata,
      createdAt: event.createdAt,
    });
    if (expected !== event.hash) return false;
    previousHash = event.hash;
  }
  return true;
}

export function auditHead(events: readonly AuditEventRecord[]): string {
  return events.length === 0 ? AUDIT_GENESIS_HASH : events[events.length - 1].hash;
}
