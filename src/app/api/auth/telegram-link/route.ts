import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens } from "@/db/schema";
import { config } from "@/lib/config";
import { setSession } from "@/lib/store";
import { maintenanceBlocked } from "@/lib/api";

export const dynamic = "force-dynamic";

/** One-time login link issued by the bot (/login). */
export async function GET(req: NextRequest) {
  const blocked = maintenanceBlocked();
  if (blocked) return blocked;
  const token = req.nextUrl.searchParams.get("token") || "";
  const claimed = await db
    .update(loginTokens)
    .set({ used: true })
    .where(
      and(
        eq(loginTokens.token, token),
        eq(loginTokens.used, false),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    return NextResponse.redirect(`${config.appUrl}/?login=expired`);
  }
  await setSession(claimed[0].userId);
  return NextResponse.redirect(`${config.appUrl}/?login=ok`);
}