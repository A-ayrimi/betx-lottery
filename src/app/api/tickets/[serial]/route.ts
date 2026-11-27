import { NextRequest, NextResponse } from "next/server";
import { isNonLivePreview, isPreviewFallbackEnabled, previewTicketBySerial } from "@/lib/previewFallback";
import { isTicketSerial } from "@/lib/ticketSerial";

export const dynamic = "force-dynamic";

const notFound = () =>
  NextResponse.json({ ok: false, error: "notFound" }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ serial: string }> }) {
  const { serial: raw } = await params;
  const serial = decodeURIComponent(raw);
  if (!isTicketSerial(serial)) return notFound();
  if (isPreviewFallbackEnabled()) {
    const preview = previewTicketBySerial(serial);
    if (preview) {
      return NextResponse.json({ ok: true, ticket: preview }, { headers: { "Cache-Control": "no-store" } });
    }
    if (isNonLivePreview()) return notFound();
  }

  try {
    const [{ limitByIp }, { getTicketBySerial }] = await Promise.all([
      import("@/lib/ratelimit"),
      import("@/lib/ticketLookup"),
    ]);
    await limitByIp("ticket-lookup", 60);
    const ticket = await getTicketBySerial(serial);
    if (!ticket) return notFound();
    return NextResponse.json({ ok: true, ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isNonLivePreview()) return notFound();
    const { handleError } = await import("@/lib/api");
    return handleError(error);
  }
}
