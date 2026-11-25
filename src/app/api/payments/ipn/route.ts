import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function gone() {
  return NextResponse.json(
    { ok: false, error: "legacy_payment_provider_disabled" },
    { status: 410 },
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}

export async function PUT() {
  return gone();
}

export async function PATCH() {
  return gone();
}

export async function DELETE() {
  return gone();
}

export async function OPTIONS() {
  return gone();
}

export async function HEAD() {
  return new Response(null, { status: 410 });
}
