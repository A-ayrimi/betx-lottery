import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { loginTokens } from "@/db/schema";
import { config } from "@/lib/config";
import { setSession } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One-time login link issued by the bot (/login). */
export async function GET(req: NextRequest) {
  // TRON-only mode: don't consume the token so the link stays valid once re-enabled.
  if (config.tronOnly) {
    return NextResponse.redirect(`${config.appUrl}/?login=soon`);
  }
  const token = req.nextUrl.searchParams.get("token") || "";
  const claimed = await db
    .update(loginTokens)
    .set({ used: true })
    .where(and(eq(loginTokens.token, token), eq(loginTokens.used, false), gt(loginTokens.expiresAt, new Date())))
    .returning();

  if (claimed.length === 0) {
    return NextResponse.redirect(`${config.appUrl}/?login=expired`);
  }
  await setSession(claimed[0].userId);
  return NextResponse.redirect(`${config.appUrl}/?login=ok`);
}
