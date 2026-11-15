"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";

interface HistoryRow {
  roundId: number;
  winnerName: string;
  winningSerial: string;
  prize: number;
  fee: number;
  capacity: number;
  sold: number;
  drawnAt: string | null;
  openedAt: string | null;
  seedHash: string | null;
  serverSeed: string | null;
  feeStatus: string;
  feeTxHash: string | null;
}

/**
 * Transparent, live draw history: every completed round with winner name,
 * winning serial and EXACT draw time. The first page comes from the live
 * app state (refreshed every 15s + instantly after your own purchase);
 * older pages load from /api/rounds/history.
 */
export function WinnersHistory() {
  const { state, demoEnabled } = useApp();
  const { d, t, n, date, href, locale } = useI18n();
  const [extra, setExtra] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const seenTop = useRef<number | null>(null);
  const live = useMemo(() => (state?.winners ?? []) as HistoryRow[], [state?.winners]);
  useEffect(() => {
    if (!demoEnabled) return;
    const id = window.setTimeout(() => setTotal(live.length), 0);
    return () => window.clearTimeout(id);
  }, [demoEnabled, live.length]);
  // round ids considered "new" (set in an effect, never read from a ref in render)
  const [freshIds, setFreshIds] = useState<number[]>([]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const cutoff = Date.now() - 120000;
      setFreshIds(
        live.filter((w) => w.drawnAt && new Date(w.drawnAt).getTime() > cutoff).map((w) => w.roundId),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [live]);

  // Flash newly arrived draws (live update while the tab is open).
  useEffect(() => {
    const top = live[0]?.roundId ?? null;
    if (top === null) return;
    if (seenTop.current === null) {
      seenTop.current = top;
      return;
    }
    if (top !== seenTop.current) {
      seenTop.current = top;
      const on = window.setTimeout(() => setHighlight(top), 0);
      const off = window.setTimeout(() => setHighlight(null), 6000);
      return () => {
        window.clearTimeout(on);
        window.clearTimeout(off);
      };
    }
  }, [live]);

  useEffect(() => {
    // Keep server-rendered + live rows as the source of truth for page 1.
    const id = window.setTimeout(
      () => setExtra((prev) => prev.filter((r) => !live.some((l) => l.roundId === r.roundId))),
      0,
    );
    return () => window.clearTimeout(id);
  }, [live]);

  const rows = [...live, ...extra].sort((a, b) => b.roundId - a.roundId);
  // De-dupe by round (live refresh may overlap with fetched pages).
  const unique = rows.filter((r, i) => rows.findIndex((x) => x.roundId === r.roundId) === i);

  const loadMore = useCallback(async () => {
    if (demoEnabled) return;
    setLoadingMore(true);
    try {
      const offset = unique.length;
      const res = await fetch(`/api/rounds/history?limit=20&offset=${offset}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setTotal(json.total);
        setExtra((prev) => {
          const ids = new Set([...live.map((l) => l.roundId), ...prev.map((p) => p.roundId)]);
          const fresh = (json.draws as HistoryRow[]).filter((r) => !ids.has(r.roundId));
          return [...prev, ...fresh];
        });
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }, [unique.length, live, demoEnabled]);

  const exact = (iso: string | null) => {
    if (!iso) return "—";
    const dt = new Date(iso);
    const utc = iso.replace("T", " ").replace("Z", " UTC").slice(0, 23);
    return { local: date(iso), utc, ms: dt.getTime() };
  };

  return (
    <section id="history" className="relative py-16 lg:py-24">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="micro flex items-center gap-2 text-foil">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-neon-2" />
              {d.board.historyKicker}
            </p>
            <h2 className="mt-4 text-[clamp(1.9rem,4.4vw,2.9rem)] font-black leading-[1.15] text-white">
              {d.board.historyTitle}
            </h2>
            <p className="mt-3 max-w-[64ch] text-[15px] leading-8 text-mint">{d.board.historyBody}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="live-dot h-2 w-2 rounded-full bg-neon-2" />
            <span dir="ltr" className="font-display text-[11px] tracking-[0.22em] text-neon-2">
              {demoEnabled ? d.wc.demoBadge : d.board.live}
            </span>
          </div>
        </div>

        <p className="mt-6 rounded-2xl border border-neon/20 bg-neon/[0.05] px-5 py-4 text-[13px] leading-7 text-mint">
          <span className="text-neon-2">◆</span> {demoEnabled ? d.draw.demoNotice : d.board.autoDrawNote}
          {!demoEnabled ? (
            <>
              <br />
              <span className="text-foil">◆</span> {d.board.treasuryNote}{" "}
              <code dir="ltr" className="font-display text-[11px] text-neon-2">
                {state?.config.adminWallet ?? state?.vault.adminWallet ?? ""}
              </code>
            </>
          ) : null}
        </p>

        <div className="panel mt-6 min-w-0 overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[64px_minmax(0,1.2fr)_minmax(0,1fr)_90px_200px_110px] gap-3 border-b border-rule px-6 py-4">
                {d.board.historyHeaders.map((h) => (
                  <p key={h} className="micro text-mint">
                    {h}
                  </p>
                ))}
              </div>
              {unique.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-mint">{d.board.noDraws}</p>
              ) : (
                unique.map((w) => {
                  const e = exact(w.drawnAt);
                  const isNew = highlight === w.roundId;
                  const fresh = freshIds.includes(w.roundId);
                  return (
                    <motion.div
                      key={w.roundId}
                      initial={false}
                      animate={isNew ? { backgroundColor: ["rgba(16,226,142,0.16)", "rgba(16,226,142,0)"] } : {}}
                      transition={{ duration: 2.5 }}
                      className="grid grid-cols-[64px_minmax(0,1.2fr)_minmax(0,1fr)_90px_200px_110px] items-center gap-3 border-b border-rule/50 px-6 py-4 last:border-b-0 hover:bg-white/[0.03]"
                    >
                      <span dir="ltr" className="font-display tnum text-start text-sm font-bold text-foil">
                        #{w.roundId}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 truncate text-[14px] font-bold text-white">
                        <span className="truncate">{w.winnerName}</span>
                        {fresh ? (
                          <span className="shrink-0 rounded-full bg-neon/15 px-2 py-0.5 text-[10px] font-bold text-neon-2">
                            {d.board.newBadge}
                          </span>
                        ) : null}
                      </span>
                      <span dir="ltr" className="font-display truncate text-start text-[12px] tracking-[0.1em] text-neon-2">
                        {w.winningSerial}
                      </span>
                      <span dir="ltr" className="font-display tnum text-start text-[14px] font-bold text-foil">
                        +${money(w.prize)}
                      </span>
                      <span className="text-[12px] leading-5 text-mint">
                        {typeof e === "string" ? (
                          e
                        ) : (
                          <>
                            <time dateTime={w.drawnAt ?? undefined} title={e.utc} suppressHydrationWarning>
                              {e.local}
                            </time>
                            <span dir="ltr" className="block font-display text-[10px] text-mint/60">
                              {e.utc}
                            </span>
                          </>
                        )}
                      </span>
                      {demoEnabled ? (
                        <span className="text-[12px] text-foil">{d.wc.demoBadge}</span>
                      ) : (
                        <a
                          href={href("/verify")}
                          className="text-[12px] text-neon-2/80 underline-offset-4 hover:underline"
                        >
                          {d.board.verify}
                        </a>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-mint/70">
            {total !== null ? t(d.board.showing, { n: n(unique.length), total: n(total) }) : ""}
          </p>
          {(total === null || unique.length < total) && unique.length > 0 ? (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="focus-ring rounded-xl border border-rule px-5 py-2.5 text-sm text-mint transition-colors hover:border-mint/50 hover:text-white disabled:opacity-50"
            >
              {loadingMore ? d.board.loading : d.board.loadMore}
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-[11px] text-mint/50">
          {locale === "fa" ? "زمان‌ها هم به وقت محلی شما و هم به وقت جهانی (UTC) نمایش داده می‌شوند." : ""}
        </p>
      </div>
    </section>
  );
}
