"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { intlTags } from "@/i18n/config";
import { money } from "@/lib/format";

interface Onchain {
  ok: boolean;
  address: string;
  status: "ok" | "inactive" | "unavailable" | "invalid";
  usdt: number | null;
  trx: number | null;
  fetchedAt: string;
  explorerUrl: string;
}

/** Live treasury balance read from the TRON blockchain (refreshes every 60s). */
export function OnchainTreasury({ demo, compact = false }: { demo: boolean; compact?: boolean }) {
  const { d, t, locale } = useI18n();
  const [data, setData] = useState<Onchain | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/vault/onchain", { cache: "no-store" });
        const j = (await r.json()) as Onchain;
        if (alive && j.ok) setData(j);
      } catch {
        /* keep last value */
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const time = data
    ? new Intl.DateTimeFormat(intlTags[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.fetchedAt))
    : "";
  const ok = data?.status === "ok" || data?.status === "inactive";

  return (
    <div className="rounded-xl border border-neon/25 bg-neon/[0.05] px-4 py-3" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="micro flex items-center gap-1.5 text-neon-2">
          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "live-dot bg-neon-2" : "bg-foil"}`} />
          {d.onchain.title}
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
            ${money(data.usdt ?? 0)}
            <span className="ms-1 text-[11px] font-medium text-mint">{d.onchain.usdt}</span>
          </p>
          <p dir="ltr" className="font-display tnum text-[12px] text-mint">
            {(data.trx ?? 0).toFixed(2)} TRX · {d.onchain.trx}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-foil">
          {!data ? "…" : data.status === "invalid" ? d.onchain.invalid : d.onchain.unavailable}
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
