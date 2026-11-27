import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { assertLegacyPermission } from "@/lib/phase2Policy";
import { setTierStatus, updateTier, type TierInput } from "@/lib/tierAdmin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "tiers:write")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const tier = await updateTier(id, body as Partial<TierInput>, auth.actor);
    return NextResponse.json({ ok: true, tier });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "tiers:write")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const id = parseId((await ctx.params).id);
  if (id === null) return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  try {
    const tier = await setTierStatus(id, "ARCHIVED", auth.actor);
    return NextResponse.json({ ok: true, tier });
  } catch (error) {
    return handleError(error);
  }
}
