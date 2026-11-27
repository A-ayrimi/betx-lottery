import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { appendAdminAuditEvent } from "@/lib/phase2Runtime";
import { adminAuditLog, ticketTiers } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import { roundMoney } from "@/lib/tierAccounting";
import { deriveTierAmounts } from "@/lib/tierMath";

export type TierStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type TierInput = {
  code: string;
  name: string;
  priceUsd: number | string;
  ticketCapacity: number | string;
  drawDurationMinutes: number | string;
  prizePercentage: number | string;
  treasuryPercentage: number | string;
  adminPercentage: number | string;
  minimumParticipants?: number | string;
  maximumParticipants?: number | string | null;
  rules?: unknown;
  status?: TierStatus;
  displayOrder?: number | string;
};

type ValidatedTier = {
  code: string;
  name: string;
  priceUsd: number;
  ticketCapacity: number;
  drawDurationMinutes: number;
  prizePercentage: number;
  treasuryPercentage: number;
  adminPercentage: number;
  minimumParticipants: number;
  maximumParticipants: number | null;
  rules: Record<string, unknown>;
  status: TierStatus;
  displayOrder: number;
};

function invalid(message: string): never {
  throw new ValidationError(message);
}

function finite(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) invalid(`${label} must be a number`);
  return n;
}

function integer(value: unknown, label: string): number {
  const n = finite(value, label);
  if (!Number.isInteger(n)) invalid(`${label} must be an integer`);
  return n;
}

function validate(input: TierInput): ValidatedTier {
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,64}$/.test(code)) invalid("Tier code must be 2-64 letters, numbers, or underscores");
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 120) invalid("Tier name must be 1-120 characters");

  const priceUsd = roundMoney(finite(input.priceUsd, "Price"));
  const ticketCapacity = integer(input.ticketCapacity, "Capacity");
  const drawDurationMinutes = integer(input.drawDurationMinutes, "Draw duration");
  const prizePercentage = roundMoney(finite(input.prizePercentage, "Prize percentage"));
  const treasuryPercentage = roundMoney(finite(input.treasuryPercentage, "Treasury percentage"));
  const adminPercentage = roundMoney(finite(input.adminPercentage, "Admin percentage"));
  const minimumParticipants = input.minimumParticipants === undefined
    ? 1
    : integer(input.minimumParticipants, "Minimum participants");
  const maximumParticipants = input.maximumParticipants === undefined || input.maximumParticipants === null || input.maximumParticipants === ""
    ? null
    : integer(input.maximumParticipants, "Maximum participants");
  const status = (input.status ?? "INACTIVE") as TierStatus;
  const displayOrder = input.displayOrder === undefined ? 0 : integer(input.displayOrder, "Display order");
  const rules = input.rules && typeof input.rules === "object" && !Array.isArray(input.rules)
    ? (input.rules as Record<string, unknown>)
    : {};

  if (priceUsd <= 0) invalid("Price must be positive");
  if (ticketCapacity <= 0) invalid("Capacity must be positive");
  if (drawDurationMinutes <= 0) invalid("Draw duration must be positive");
  if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) invalid("Invalid tier status");
  if (minimumParticipants <= 0 || minimumParticipants > ticketCapacity) invalid("Minimum participants is outside capacity");
  if (maximumParticipants !== null && (maximumParticipants < minimumParticipants || maximumParticipants > ticketCapacity)) {
    invalid("Maximum participants is outside the allowed range");
  }

  deriveTierAmounts({
    priceUsd,
    capacity: ticketCapacity,
    prizePercentage,
    treasuryPercentage,
    adminPercentage,
  });

  return {
    code,
    name,
    priceUsd,
    ticketCapacity,
    drawDurationMinutes,
    prizePercentage,
    treasuryPercentage,
    adminPercentage,
    minimumParticipants,
    maximumParticipants,
    rules,
    status,
    displayOrder,
  };
}

function serialize(tier: ValidatedTier) {
  return {
    code: tier.code,
    name: tier.name,
    priceUsd: String(tier.priceUsd),
    ticketCapacity: tier.ticketCapacity,
    drawDurationMinutes: tier.drawDurationMinutes,
    prizePercentage: String(tier.prizePercentage),
    treasuryPercentage: String(tier.treasuryPercentage),
    adminPercentage: String(tier.adminPercentage),
    minimumParticipants: tier.minimumParticipants,
    maximumParticipants: tier.maximumParticipants,
    rules: tier.rules,
    status: tier.status,
    displayOrder: tier.displayOrder,
  };
}

export async function listAllTiers() {
  return db.select().from(ticketTiers).orderBy(asc(ticketTiers.displayOrder), asc(ticketTiers.id));
}

export async function createTier(input: TierInput, actor: string) {
  return db.transaction(async (tx) => {
    const values = serialize(validate(input));
    const existing = (await tx.select({ id: ticketTiers.id }).from(ticketTiers).where(eq(ticketTiers.code, values.code)).limit(1))[0];
    if (existing) invalid("Tier code already exists");
    const created = (await tx.insert(ticketTiers).values(values).returning())[0];
    await tx.insert(adminAuditLog).values({
      actor,
      action: "tier.create",
      entity: "tier",
      entityId: created.id,
      details: values,
    });
    await appendAdminAuditEvent(tx, {
      actor,
      action: "tier.create",
      subject: `tier:${created.id}`,
      metadata: values,
    });
    return created;
  });
}

export async function updateTier(id: number, input: Partial<TierInput>, actor: string) {
  return db.transaction(async (tx) => {
    const before = (await tx.select().from(ticketTiers).where(eq(ticketTiers.id, id)).for("update"))[0];
    if (!before) invalid("Tier not found");
    const merged: TierInput = {
      code: input.code ?? before.code,
      name: input.name ?? before.name,
      priceUsd: input.priceUsd ?? before.priceUsd,
      ticketCapacity: input.ticketCapacity ?? before.ticketCapacity,
      drawDurationMinutes: input.drawDurationMinutes ?? before.drawDurationMinutes,
      prizePercentage: input.prizePercentage ?? before.prizePercentage,
      treasuryPercentage: input.treasuryPercentage ?? before.treasuryPercentage,
      adminPercentage: input.adminPercentage ?? before.adminPercentage,
      minimumParticipants: input.minimumParticipants ?? before.minimumParticipants,
      maximumParticipants: input.maximumParticipants === undefined ? before.maximumParticipants : input.maximumParticipants,
      rules: input.rules ?? before.rules,
      status: input.status ?? (before.status as TierStatus),
      displayOrder: input.displayOrder ?? before.displayOrder,
    };
    const values = serialize(validate(merged));
    const duplicate = (
      await tx.select({ id: ticketTiers.id })
        .from(ticketTiers)
        .where(and(eq(ticketTiers.code, values.code), ne(ticketTiers.id, id)))
        .limit(1)
    )[0];
    if (duplicate) invalid("Tier code already exists");
    const updated = (
      await tx.update(ticketTiers)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(ticketTiers.id, id))
        .returning()
    )[0];
    await tx.insert(adminAuditLog).values({
      actor,
      action: "tier.update",
      entity: "tier",
      entityId: id,
      details: { before, after: updated },
    });
    await appendAdminAuditEvent(tx, {
      actor,
      action: "tier.update",
      subject: `tier:${id}`,
      metadata: { before, after: updated },
    });
    return updated;
  });
}

export async function setTierStatus(id: number, status: TierStatus, actor: string) {
  return db.transaction(async (tx) => {
    const before = (await tx.select().from(ticketTiers).where(eq(ticketTiers.id, id)).for("update"))[0];
    if (!before) invalid("Tier not found");
    if (!["ACTIVE", "INACTIVE", "ARCHIVED"].includes(status)) invalid("Invalid tier status");
    const updated = (
      await tx.update(ticketTiers)
        .set({ status, updatedAt: new Date() })
        .where(eq(ticketTiers.id, id))
        .returning()
    )[0];
    await tx.insert(adminAuditLog).values({
      actor,
      action: "tier.status",
      entity: "tier",
      entityId: id,
      details: { from: before.status, to: status },
    });
    await appendAdminAuditEvent(tx, {
      actor,
      action: "tier.status",
      subject: `tier:${id}`,
      metadata: { from: before.status, to: status },
    });
    return updated;
  });
}
