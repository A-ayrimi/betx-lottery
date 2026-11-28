import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { deposits, users } from "../db/schema.ts";
import { effectiveLimit } from "./responsibleGaming.ts";
import { assertMutationsOpen } from "./mutationGuard.ts";

type Database = NodePgDatabase<Record<string, never>>;

const COUNTED_STATUSES = [
  "waiting",
  "confirming",
  "confirmed",
  "sending",
  "partially_paid",
  "finished",
];

export function isValidDepositIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export class DepositReservationError extends Error {
  readonly code: "user_not_found" | "idempotency_conflict" | "daily_limit";
  readonly limit?: number;

  constructor(
    code: "user_not_found" | "idempotency_conflict" | "daily_limit",
    limit?: number,
  ) {
    super(code);
    this.code = code;
    this.limit = limit;
  }
}

export async function reserveDeposit(
  database: Database,
  params: {
    userId: number;
    provider: string;
    amount: number;
    orderId: string;
    idempotencyKey: string;
    fromAddress?: string;
    payCurrency?: string;
  },
) {
  assertMutationsOpen();
  return database.transaction(async (tx) => {
    const user = (
      await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId))
        .for("update")
    )[0];
    if (!user) throw new DepositReservationError("user_not_found");

    const existing = (
      await tx
        .select({ id: deposits.id })
        .from(deposits)
        .where(
          and(
            eq(deposits.userId, params.userId),
            eq(deposits.provider, params.provider),
            eq(deposits.idempotencyKey, params.idempotencyKey),
          ),
        )
        .limit(1)
    )[0];
    if (existing) throw new DepositReservationError("idempotency_conflict");

    const now = new Date();
    await tx
      .update(deposits)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(deposits.userId, params.userId),
          eq(deposits.provider, "solana"),
          eq(deposits.status, "waiting"),
          lt(deposits.createdAt, new Date(now.getTime() - 2 * 60 * 1000)),
        ),
      );

    const limit = effectiveLimit(user);
    if (limit !== null) {
      const [totals] = await tx
        .select({ total: sql<string>`coalesce(sum(${deposits.amountUsd}), 0)` })
        .from(deposits)
        .where(
          and(
            eq(deposits.userId, params.userId),
            gte(deposits.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
            inArray(deposits.status, COUNTED_STATUSES),
          ),
        );
      if (Number(totals?.total ?? 0) + params.amount > limit) {
        throw new DepositReservationError("daily_limit", limit);
      }
    }

    return (
      await tx
        .insert(deposits)
        .values({
          userId: params.userId,
          provider: params.provider,
          orderId: params.orderId,
          idempotencyKey: params.idempotencyKey,
          amountUsd: String(params.amount),
          payCurrency: params.payCurrency ?? "usdttrc20",
          fromAddress: params.fromAddress,
          status: "waiting",
        })
        .returning()
    )[0];
  });
}

