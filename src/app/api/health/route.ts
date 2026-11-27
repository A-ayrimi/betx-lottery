import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { phase2Readiness } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    let automation: { lastRunAt: string | null; ageSeconds: number | null } = { lastRunAt: null, ageSeconds: null };
    try {
      const r = await db.execute(sql`select last_run_at from automation_state where id = 'main'`);
      const t = (r.rows[0] as { last_run_at?: string } | undefined)?.last_run_at ?? null;
      automation = { lastRunAt: t, ageSeconds: t ? Math.round((Date.now() - new Date(t).getTime()) / 1000) : null };
    } catch {
      /* table may not exist yet on first boot */
    }
    return NextResponse.json({ ok: true, service: "betx", db: "up", automation, phase2Gate: phase2Readiness() });
  } catch {
    return NextResponse.json({ ok: false, service: "betx", db: "down" }, { status: 500 });
  }
}
