import { NextRequest, NextResponse } from "next/server";
import { and, desc, inArray } from "drizzle-orm";
import { rounds } from "@/db/schema";
import { isNonLivePreview, isPreviewFallbackEnabled, previewProgress } from "@/lib/previewFallback";
import { shouldUseDevPreviewFallback } from "@/lib/rateLimitFailOpen";

export const dynamic = "force-dynamic";

function previewResponse() {
  return NextResponse.json(
    { ok: true, tiers: previewProgress() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(_req: NextRequest) {
  if (isNonLivePreview()) return previewResponse();

  try {
    const [{ limitByIp }, { db }, { listActiveTiers }] = await Promise.all([
      import("@/lib/ratelimit"),
      import("@/db"),
      import("@/lib/store"),
    ]);
    await limitByIp("state", 120);
    const tiers = await listActiveTiers();
    const openRows = tiers.length
      ? await db
          .select({
            tierId: rounds.tierId,
            roundId: rounds.id,
            sold: rounds.sold,
            capacity: rounds.capacity,
            seedHash: rounds.seedHash,
            closesAt: rounds.closesAt,
          })
          .from(rounds)
          .where(and(inArray(rounds.tierId, tiers.map((tier) => tier.id)), inArray(rounds.status, ["OPEN", "open"])))
          .orderBy(desc(rounds.id))
      : [];

    const byTier = new Map<number, (typeof openRows)[number]>();
    for (const row of openRows) if (!byTier.has(row.tierId)) byTier.set(row.tierId, row);

    const progress = tiers.map((tier) => {
      const row = byTier.get(tier.id);
      const capacity = Math.max(1, Number(row?.capacity ?? tier.capacity));
      const sold = Math.max(0, Math.min(capacity, Number(row?.sold ?? 0)));
      return {
        code: tier.code,
        tierNumber: tier.displayOrder,
        roundId: row?.roundId ?? null,
        sold,
        capacity,
        remaining: Math.max(0, capacity - sold),
        seedHash: row?.seedHash ?? null,
        closesAt: row?.closesAt ? new Date(row.closesAt).toISOString() : null,
      };
    });

    const empty = tiers.length === 0 || progress.every((item) => item.roundId === null);
    return NextResponse.json(
      { ok: true, tiers: isPreviewFallbackEnabled() && empty ? previewProgress() : progress },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isPreviewFallbackEnabled() || shouldUseDevPreviewFallback(error)) return previewResponse();
    const { handleError } = await import("@/lib/api");
    return handleError(error);
  }
}
