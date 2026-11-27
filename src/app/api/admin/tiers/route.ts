import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { assertLegacyPermission } from "@/lib/phase2Policy";
import { createTier, listAllTiers, type TierInput } from "@/lib/tierAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN", "VIEWER"]);
  if (!auth) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!assertLegacyPermission(auth.role, "tiers:read")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    return NextResponse.json({ ok: true, tiers: await listAllTiers() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "tiers:write")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const tier = await createTier(body as TierInput, auth.actor);
    return NextResponse.json({ ok: true, tier }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
