import { NextResponse, after } from "next/server";
import { getState } from "@/lib/store";
import { maybeRunAutomation } from "@/lib/automation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getState();
    // heartbeat: keeps the autopilot running while anyone has the site open
    after(maybeRunAutomation);
    return NextResponse.json({ ok: true, state });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "state_failed" }, { status: 500 });
  }
}
