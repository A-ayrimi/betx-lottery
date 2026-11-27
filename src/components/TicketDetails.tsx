"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { useApp } from "./AppProvider";

const subscribeToLocation = () => () => {};
const getLocationOrigin = () => window.location.origin;
const getServerLocationOrigin = () => "";

export type TicketView = {
  serial: string;
  roundId: number;
  status?: string;
  kind?: string;
  createdAt?: string;
  prize?: number;
  walletAddress?: string | null;
  transactionReference?: string | null;
};

type LiveTicket = {
  serial: string;
  roundId: number;
  roundStatus: string;
  ticketStatus: "pending" | "winner" | "lost" | "refunded";
  tierName: string;
  username: string;
  walletAddress: string | null;
  transactionSignature: string | null;
  createdAt: string;
  winningSerial: string | null;
  prize: number;
  seedHash: string | null;
};

function useCopySerial() {
  const { d } = useI18n();
  const { setToast } = useApp();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (serial: string) => {
    try {
      await navigator.clipboard.writeText(serial);
      setCopied(serial);
      setToast(d.ticket.copied);
    } catch {
      setToast(d.ticket.copyFail);
    }
  };

  return { copied, copy };
}

export function TicketDetailModal({ ticket, onClose }: { ticket: TicketView; onClose: () => void }) {
  const { d, locale, href } = useI18n();
  const { copied, copy } = useCopySerial();
  const origin = useSyncExternalStore(subscribeToLocation, getLocationOrigin, getServerLocationOrigin);
  const [liveState, setLiveState] = useState<{ serial: string; ticket: LiveTicket } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticket.serial)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({ ok: false }));
        if (active && res.ok && json.ok && json.ticket) setLiveState({ serial: ticket.serial, ticket: json.ticket as LiveTicket });
      } catch {
        if (active) setLiveState(null);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [ticket.serial]);

  const live = liveState?.serial === ticket.serial ? liveState.ticket : null;
  const view: TicketView = live
    ? {
        serial: live.serial,
        roundId: live.roundId,
        status: live.ticketStatus,
        kind: ticket.kind,
        createdAt: live.createdAt,
        prize: live.prize,
        walletAddress: live.walletAddress,
        transactionReference: live.transactionSignature,
      }
    : ticket;
  const statusKey = view.status ?? "pending";
  const label = (d.ticket.statusLabels as Record<string, string>)[statusKey] ?? statusKey;
  const roundStatusLabel = live
    ? (d.ticket.roundStatusLabels as Record<string, string>)[live.roundStatus] ?? live.roundStatus
    : "";
  const lookupPath = href(`/ticket/${encodeURIComponent(ticket.serial)}`);
  const lookupUrl = origin ? `${origin}${lookupPath}` : "";
  const verifyPath = href(`/verify/${view.roundId}`);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#04100c]/85 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`${d.ticket.title} ${view.serial}`}
      onClick={onClose}
    >
      <div
        className="panel relative w-full max-w-md rounded-2xl border border-foil/35 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="micro text-foil">{d.ticket.title}</p>
            <h3 className="mt-2 text-xl font-black text-white">{d.ticket.serial}</h3>
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-rule px-3 py-1.5 text-xs text-mint">
            {d.ticket.close}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-foil/25 bg-foil/[0.05] p-4">
          <p dir="ltr" className="break-all font-display text-sm font-bold tracking-[0.1em] text-white">
            {view.serial}
          </p>
          <button
            type="button"
            onClick={() => void copy(view.serial)}
            className="focus-ring mt-3 rounded-full border border-neon/35 px-4 py-1.5 text-xs font-bold text-neon-2 hover:bg-neon/10"
          >
            {copied === view.serial ? d.ticket.copied : d.ticket.copy}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
          <p className="rounded-xl border border-rule bg-black/20 p-3">
            <span className="micro block text-mint/70">{d.ticket.round}</span>
            <span className="font-display mt-1 block text-sm font-bold text-white">{formatNumber(view.roundId, locale)}</span>
          </p>
          <p className="rounded-xl border border-rule bg-black/20 p-3">
            <span className="micro block text-mint/70">{d.ticket.status}</span>
            <span className="mt-1 block text-sm font-bold text-foil">{label}</span>
          </p>
          {roundStatusLabel ? (
            <p className="col-span-2 rounded-xl border border-rule bg-black/20 p-3">
              <span className="micro block text-mint/70">{d.ticket.roundStatus}</span>
              <span className="mt-1 block text-sm font-bold text-white">{roundStatusLabel}</span>
            </p>
          ) : null}
          {live?.tierName ? (
            <p className="rounded-xl border border-rule bg-black/20 p-3">
              <span className="micro block text-mint/70">{d.verification.tier}</span>
              <span className="mt-1 block text-sm font-bold text-white">{live.tierName}</span>
            </p>
          ) : null}
          {live?.username ? (
            <p className="rounded-xl border border-rule bg-black/20 p-3">
              <span className="micro block text-mint/70">{d.verification.owner}</span>
              <span className="mt-1 block text-sm font-bold text-white">{live.username}</span>
            </p>
          ) : null}
          {live?.winningSerial ? (
            <p className="col-span-2 rounded-xl border border-rule bg-black/20 p-3">
              <span className="micro block text-mint/70">{d.verification.winningSerial}</span>
              <span dir="ltr" className="font-display mt-1 block break-all text-start text-sm font-bold text-foil">
                {live.winningSerial}
              </span>
            </p>
          ) : null}
        </div>

        {view.transactionReference ? (
          <p className="mt-3 break-all text-[11px] text-mint/70">
            <span className="micro block text-mint/60">{d.ticket.transaction}</span>
            <span dir="ltr" className="font-display">{view.transactionReference}</span>
          </p>
        ) : null}

        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-rule bg-black/25 p-4 text-center">
          {lookupUrl ? (
            <a href={lookupUrl} target="_blank" rel="noreferrer" aria-label={d.ticket.scan} className="focus-ring rounded-lg">
              <QRCodeSVG value={lookupUrl} size={132} includeMargin level="M" aria-label={d.ticket.qrAlt} />
            </a>
          ) : (
            <div className="h-[132px] w-[132px] animate-pulse rounded bg-white/5" />
          )}
          <p className="micro text-foil">{d.ticket.helpTitle}</p>
          <p className="text-[12px] leading-6 text-mint">{d.ticket.helpKeep}</p>
          <p className="text-[12px] leading-6 text-neon-2">{d.ticket.helpLive}</p>
          <a href={lookupPath} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-neon-2 hover:underline">
            {d.ticket.inspect} ↗
          </a>
          <a href={verifyPath} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-foil hover:underline">
            {d.ticket.helpVerify} ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export function TicketPublicCopy({
  serial,
  copyLabel,
  copiedLabel,
  failLabel,
}: {
  serial: string;
  copyLabel: string;
  copiedLabel: string;
  failLabel: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serial);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="focus-ring rounded-full border border-neon/35 px-4 py-2 text-xs font-bold text-neon-2 hover:bg-neon/10"
      >
        {state === "copied" ? copiedLabel : copyLabel}
      </button>
      {state === "failed" ? <span className="text-[11px] text-foil">{failLabel}</span> : null}
    </div>
  );
}

export function TicketPublicQr({ url, alt, label }: { url: string; alt: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label={label} className="focus-ring inline-block rounded-lg">
      <QRCodeSVG value={url} size={132} includeMargin level="M" aria-label={alt} />
    </a>
  );
}

export function TicketSerialRow({ ticket }: { ticket: TicketView }) {
  const { d, locale } = useI18n();
  const { copied, copy } = useCopySerial();
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-foil/25 bg-black/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="micro text-mint/70">{d.ticket.round}: {formatNumber(ticket.roundId, locale)}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            dir="ltr"
            className="focus-ring mt-1 block break-all text-start font-display text-[13px] font-bold tracking-[0.08em] text-white hover:text-foil"
          >
            {ticket.serial}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void copy(ticket.serial)}
            className="focus-ring rounded-full border border-neon/35 px-3 py-1.5 text-[11px] font-bold text-neon-2 hover:bg-neon/10"
          >
            {copied === ticket.serial ? d.ticket.copied : d.ticket.copy}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-ring rounded-full border border-foil/35 px-3 py-1.5 text-[11px] font-bold text-foil hover:bg-foil/10"
          >
            {d.ticket.inspect}
          </button>
        </div>
      </div>
      {open ? <TicketDetailModal ticket={ticket} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

export function PurchaseReceipt({
  serials,
  roundId,
  transactionReference,
  onClose,
}: {
  serials: string[];
  roundId: number;
  transactionReference?: string | null;
  onClose: () => void;
}) {
  const { d, locale } = useI18n();
  if (serials.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#04100c]/85 px-4 py-8 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={d.ticket.purchaseTitle}
      onClick={onClose}
    >
      <div
        className="panel relative w-full max-w-lg rounded-2xl border border-neon/35 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="micro text-neon-2">{d.ticket.purchaseTitle}</p>
            <h3 className="mt-2 text-xl font-black text-white">{formatNumber(serials.length, locale)}</h3>
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-lg border border-rule px-3 py-1.5 text-xs text-mint">
            {d.ticket.close}
          </button>
        </div>
        <p className="micro mt-4 text-foil">{d.ticket.helpTitle}</p>
        <p className="mt-1 text-[12px] leading-6 text-mint">{d.ticket.helpKeep}</p>
        {transactionReference ? (
          <p className="mt-3 break-all text-[11px] text-mint/70">
            <span className="micro block text-mint/60">{d.ticket.transaction}</span>
            <span dir="ltr" className="font-display">{transactionReference}</span>
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          {serials.map((serial) => (
            <TicketSerialRow
              key={serial}
              ticket={{ serial, roundId, status: "pending", transactionReference }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
