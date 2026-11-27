import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin";
import { handleError, maintenanceBlocked } from "@/lib/api";
import { initializeAdminVault } from "@/lib/store";
import { assertLegacyPermission } from "@/lib/phase2Policy";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireAdminRole(req, ["ADMIN"]);
  if (!auth) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!assertLegacyPermission(auth.role, "vault:write")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const blocked = maintenanceBlocked();
  if (blocked) return blocked;
  try {
    const vault = await initializeAdminVault(auth.actor);
    return NextResponse.json({ ok: true, vaultId: vault.id, initialCapital: Number(vault.initialCapital) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
