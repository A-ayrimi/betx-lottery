import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeTransfers } from "@/db/schema";

/**
 * Legacy fee transfers are read-only until historical accounting is reconciled.
 */

export function feeConfig() {
  return {
    enabled: false,
    keyConfigured: false,
    keyValid: false,
    hotWallet: null,
    adminWallet: "",
    threshold: 0,
    max: 0,
  };
}

export async function feeQueue() {
  const rows = await db
    .select()
    .from(feeTransfers)
    .where(inArray(feeTransfers.status, ["accrued", "queued", "processing", "failed"]))
    .orderBy(feeTransfers.id)
    .limit(50);
  const [agg] = await db
    .select({
      pending: sql<string>`coalesce(sum(case when ${feeTransfers.status} in ('accrued','queued','processing','failed') then ${feeTransfers.amount} else 0 end),0)`,
      paid: sql<string>`coalesce(sum(case when ${feeTransfers.status} = 'paid' then ${feeTransfers.amount} else 0 end),0)`,
    })
    .from(feeTransfers);
  return { rows, pending: Number(agg.pending), paid: Number(agg.paid) };
}

