import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { TicketPublicCopy, TicketPublicQr } from "@/components/TicketDetails";
import { getDictionary } from "@/i18n";
import { dirOf, intlTags, isLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { isNonLivePreview, isPreviewFallbackEnabled, previewTicketBySerial } from "@/lib/previewFallback";
import { isTicketSerial } from "@/lib/ticketSerial";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: PageProps<"/[locale]/ticket/[serial]">) {
  const { locale, serial } = await params;
  if (!isLocale(locale)) notFound();

  const d = getDictionary(locale);
  const v = d.verification;
  const home = `/${locale}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  let ticket = null;
  const decoded = decodeURIComponent(serial);
  if (isPreviewFallbackEnabled() && isTicketSerial(decoded)) {
    ticket = previewTicketBySerial(decoded);
  }
  if (!ticket && !isNonLivePreview() && isTicketSerial(decoded)) {
    try {
      const { getTicketBySerial } = await import("@/lib/ticketLookup");
      ticket = await getTicketBySerial(decoded);
    } catch {
      ticket = null;
    }
  }

  const statusLabel = ticket
    ? (d.ticket.statusLabels as Record<string, string>)[ticket.ticketStatus] ?? ticket.ticketStatus
    : "";
  const roundStatusLabel = ticket
    ? (d.ticket.roundStatusLabels as Record<string, string>)[ticket.roundStatus] ?? ticket.roundStatus
    : "";
  const created = ticket
    ? new Intl.DateTimeFormat(intlTags[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(ticket.createdAt))
    : "";
  const ticketPath = `${home}/ticket/${encodeURIComponent(decoded)}`;
  const lookupUrl = `${protocol}://${host}${ticketPath}`;
  const roundVerification = ticket ? `${home}/verify/${ticket.roundId}` : home;

  return (
    <main dir={dirOf(locale)} lang={locale} className="mx-auto min-h-screen max-w-3xl px-4 py-12 text-start sm:px-6">
      <Link href={home} className="focus-ring inline-block rounded-lg">
        <Logo />
      </Link>
      <p className="micro mt-10 text-neon-2">{v.kicker}</p>
      <h1 className="mt-3 text-3xl font-black text-white">{d.ticket.title}</h1>

      <div className="panel mt-8 rounded-2xl p-6">
        {!ticket ? (
          <p className="text-sm leading-7 text-mint">{d.ticket.notFound}</p>
        ) : (
          <div className="space-y-4">
            <Row label={v.serial} value={ticket.serial} />
            <Row label={v.round} value={formatNumber(ticket.roundId, locale)} />
            <Row label={v.status} value={statusLabel} />
            <Row label={d.ticket.roundStatus} value={roundStatusLabel} />
            <Row label={v.tier} value={ticket.tierName} />
            <Row label={v.owner} value={ticket.username} />
            {ticket.walletAddress ? <Row label={v.wallet} value={ticket.walletAddress} /> : null}
            {ticket.transactionSignature ? <Row label={v.transaction} value={ticket.transactionSignature} /> : null}
            <Row label={v.created} value={created} />
            {ticket.seedHash ? <Row label={v.commitment} value={ticket.seedHash} /> : null}
            {ticket.winningSerial ? <Row label={v.winningSerial} value={ticket.winningSerial} /> : null}
            {ticket.ticketStatus === "pending" ? <p className="text-[13px] leading-7 text-mint/80">{v.pendingText}</p> : null}
          </div>
        )}
      </div>

      {ticket ? (
        <div className="panel mt-4 rounded-2xl p-6">
          <p className="micro text-foil">{d.ticket.helpTitle}</p>
          <p className="mt-2 text-sm leading-7 text-mint">{d.ticket.helpKeep}</p>
          <div className="mt-5 flex flex-wrap items-center gap-5">
            <TicketPublicQr url={lookupUrl} alt={d.ticket.qrAlt} label={d.ticket.scan} />
            <TicketPublicCopy
              serial={ticket.serial}
              copyLabel={d.ticket.copy}
              copiedLabel={d.ticket.copied}
              failLabel={d.ticket.copyFail}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-[13px]">
            <span className="text-neon-2">{d.ticket.helpLive}</span>
            <Link href={roundVerification} className="text-foil hover:underline">{d.ticket.helpVerify}</Link>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-4 text-[13px]">
        <Link href={home} className="text-foil hover:underline">{v.home}</Link>
        {ticket ? (
          <Link href={roundVerification} className="text-neon-2 hover:underline">{v.openRound}</Link>
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="micro text-mint">{label}</p>
      <p dir="ltr" className="font-display mt-1 break-all text-start text-[13px] text-white">
        {value}
      </p>
    </div>
  );
}
