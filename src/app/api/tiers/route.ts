import { NextResponse } from "next/server";
import { handleError } from "@/lib/api";
import { listActiveTiers } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, tiers: await listActiveTiers() });
  } catch (error) {
    return handleError(error);
  }
}
