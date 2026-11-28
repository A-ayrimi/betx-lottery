import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/store";
import { maintenanceBlocked } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  const blocked = maintenanceBlocked();
  if (blocked) return blocked;
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
