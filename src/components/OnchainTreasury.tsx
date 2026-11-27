"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { BalanceBadge } from "./BalanceBadge";
import { intlTags } from "@/i18n/config";
import { formatNumber, usd } from "@/lib/format";
import { useMounted } from "@/lib/useStored";

interface Onchain {
  ok: boolean;
  address: string;
  status: "ok" | "inactive" | "unavailable" | "invalid";
  usdc: number | null;
  sol: number | null;
  usdt?: number | null;
  trx?: number | null;
  fetchedAt: string;
  explorerUrl: string;
}

/** Live treasury balance read from the Solana blockchain (refreshes every 60s). */
export function OnchainTreasury({ demo, compact = false }: { demo: boolean; compact?: boolean }) {
  const { d, t, locale } = useI18n();
  const [data, setData] = useState<Onchain | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    if (demo) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/vault/onchain", { cache: "no-store" });
        const j = (await r.json()) as Onchain;
        if (!alive) return;
        if (r.ok && j.ok) {
          setData(j);
          setFailed(false);
        } else {
          setData(null);
          setFailed(true);
        }
      } catch {
        if (alive) {
          setData(null);
          setFailed(true);
        }
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [demo]);

  if (demo) {
    return (
      <div className="rounded-xl border border-foil/30 bg-foil/[0.05] px-4 py-3">
        <p className="micro flex flex-wrap items-center gap-2 text-foil">
          {d.onchain.title} <BalanceBadge kind="demo" />
        </p>
        <p className="mt-2 text-[12px] leading-6 text-mint/80">{d.onchain.demoNote}</p>
      </div>
    );
  }

  const time = mounted && data
    ? new Intl.DateTimeFormat(intlTags[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.fetchedAt))
    : "";
  const ok = data?.status === "ok" || data?.status === "inactive";

  return (
    <div className="rounded-xl border border-neon/25 bg-neon/[0.05] px-4 py-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="micro flex items-center gap-1.5 text-neon-2">
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "live-dot bg-neon-2" : "bg-foil"}`} />
          {d.onchain.title}
          <BalanceBadge kind="onchain" />
        </p>
        {data ? (
          <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-neon-2 underline-offset-4 hover:underline">
            {d.onchain.view} ↗
          </a>
        ) : null}
      </div>

      {data && ok ? (
        <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-1">
          <p dir="ltr" className="font-display tnum text-2xl font-bold text-white">
            {data.usdc === null ? d.ui.noData : `${usd(data.usdc, locale)}`}
            <span className="ms-1 text-[11px] font-medium text-mint">USDC</span>
          </p>
          <p dir="ltr" className="font-display tnum text-[12px] text-mint">
            {data.sol === null ? d.ui.noData : `${formatNumber(data.sol, locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} SOL`} · SOL
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-foil">
          {!data
            ? failed
              ? d.errors.unavailable
              : d.vaultChart.loading
            : data.status === "invalid"
              ? d.onchain.invalid
              : d.onchain.unavailable}
        </p>
      )}

      {data?.status === "inactive" ? <p className="mt-1 text-[11px] text-foil">{d.onchain.inactive}</p> : null}
      <p dir="ltr" className="mt-1 truncate text-start font-display text-[10px] text-mint/60" title={data?.address}>
        {data?.address}
      </p>
      {!compact ? (
        <>
          <p className="mt-1 text-[10px] leading-5 text-mint/60">{demo ? d.onchain.demoNote : d.onchain.ledgerNote}</p>
          {time ? <p className="text-[10px] text-mint/50">{t(d.onchain.checked, { time })}</p> : null}
        </>
      ) : null}
    </div>
  );
}
