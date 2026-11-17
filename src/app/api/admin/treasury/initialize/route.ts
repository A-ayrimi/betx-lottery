import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { handleError } from "@/lib/api";
import { initializeAdminVault } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const vault = await initializeAdminVault("admin");
    return NextResponse.json({ ok: true, vaultId: vault.id, initialCapital: Number(vault.initialCapital) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
