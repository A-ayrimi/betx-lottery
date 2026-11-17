import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const got = bearer;
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called every minute by Vercel Cron / GitHub Actions / cron-job.org. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const result = await runAutomation("cron");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("cron failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
