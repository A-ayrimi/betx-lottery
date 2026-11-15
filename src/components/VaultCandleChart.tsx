"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/i18n/client";
import { intlTags } from "@/i18n/config";
import { money } from "@/lib/format";
import type { AppState } from "@/lib/types";
import { OnchainTreasury } from "./OnchainTreasury";
import { useApp } from "./AppProvider";

/* ------------------------------------------------------------------ types */

type Tf = "round" | "24h" | "30d";

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  volume: number;
  fees: number;
  n: number;
}

interface Summary {
  current: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
  fees: number;
  count: number;
  initialCapital: number;
}

interface Payload {
  ok: boolean;
  tf: Tf;
  candles: Candle[];
  summary: Summary;
  updatedAt: string;
}

const TFS: Tf[] = ["round", "24h", "30d"];
const C_UP = "#35ffb0";
const C_DOWN = "#f87171";
const C_FLAT = "#8fa8a0";
const C_MA = "#e9c46a";
const C_FEES = "rgba(233,196,106,0.32)";
const MA_WINDOW = 7;

/* --------------------------------------------------------------- helpers */

/** Measures a box with ResizeObserver. The ref is a callback (no ref reads during render). */
function useBox() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return { setNode, w: box.w, h: box.h };
}

function downloadCsv(candles: Candle[], tf: Tf) {
  const header = "time_utc,open,high,low,close,volume,fees,events";
  const rows = candles.map((c) =>
    [new Date(c.t).toISOString(), c.o, c.h, c.l, c.c, c.volume, c.fees, c.n].join(","),
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `betx-vault-${tf}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function makeDemoPayload(state: AppState | null, tf: Tf): Payload {
  const now = Date.now();
  const initialCapital = state?.vault.initialCapital ?? 20;
  const current = state?.vault.balance ?? initialCapital;
  const count = tf === "round" ? Math.max(1, state?.vault.roundsCompleted ?? 0) : tf === "24h" ? 24 : 30;
  const volume = (state?.vault.totalFees ?? 0) + (state?.vault.totalPaid ?? 0);
  const candles = Array.from({ length: count }, (_, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const close = initialCapital + (current - initialCapital) * progress;
    const open = index === 0 ? initialCapital : initialCapital + (current - initialCapital) * ((index - 1) / (count - 1));
    const wiggle = Math.max(0.01, Math.abs(current - initialCapital) * 0.02);
    const t = now - (count - index - 1) * (tf === "30d" ? 86_400_000 : 3_600_000);
    return {
      t,
      o: open,
      h: Math.max(open, close) + wiggle,
      l: Math.max(0, Math.min(open, close) - wiggle),
      c: close,
      volume: index === count - 1 ? volume : 0,
      fees: index === count - 1 ? state?.vault.totalFees ?? 0 : 0,
      n: index === count - 1 ? state?.vault.roundsCompleted ?? 0 : 0,
    };
  });
  const change = current - initialCapital;
  const high = Math.max(initialCapital, current);
  const low = Math.min(initialCapital, current);
  return {
    ok: true,
    tf,
    candles,
    summary: {
      current,
      change,
      changePct: initialCapital ? (change / initialCapital) * 100 : 0,
      high,
      low,
      volume,
      fees: state?.vault.totalFees ?? 0,
      count: state?.vault.roundsCompleted ?? 0,
      initialCapital,
    },
    updatedAt: new Date(now).toISOString(),
  };
}

/* ----------------------------------------------------------------- chart */

/**
 * Candlestick chart drawn in SVG (no third-party charting dependency).
 * Crosshair + tooltip follow the pointer or touch; ←/→ step through candles.
 * Chart is always LTR: time flows left → right in every locale.
 */
function CandleChart({
  candles,
  tf,
  tag,
  showMa,
  showVol,
  label,
  labels,
}: {
  candles: Candle[];
  tf: Tf;
  tag: string;
  showMa: boolean;
  showVol: boolean;
  label: string;
  labels: { open: string; high: string; low: string; close: string; volume: string; fees: string };
}) {
  const { setNode, w, h } = useBox();
  const [hover, setHover] = useState<number | null>(null);
  const n = candles.length;

  const padL = w < 460 ? 54 : 66;
  const padR = 66;
  const padT = 14;
  const padB = 28;
  const plotW = Math.max(20, w - padL - padR);
  const plotH = Math.max(20, h - padT - padB);
  const volH = showVol ? Math.round(plotH * 0.2) : 0;
  const priceH = plotH - volH - (showVol ? 10 : 0);
  const step = plotW / Math.max(1, n);
  const bodyW = Math.max(2, Math.min(18, step * 0.6));

  const range = useMemo(() => {
    if (!n) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    if (hi - lo < 0.01) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }, [candles, n]);

  const maxVolume = useMemo(() => candles.reduce((m, c) => Math.max(m, c.volume), 0.01), [candles]);

  const ma = useMemo(() => {
    const out: (number | null)[] = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].c;
      if (i >= MA_WINDOW) sum -= candles[i - MA_WINDOW].c;
      out.push(i >= MA_WINDOW - 1 ? sum / MA_WINDOW : null);
    }
    return out;
  }, [candles]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(
        tag,
        tf === "24h"
          ? { hour: "2-digit", minute: "2-digit" }
          : tf === "round"
            ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
            : { month: "short", day: "numeric" },
      ),
    [tag, tf],
  );

  const yOf = (v: number) => padT + (1 - (v - range.lo) / (range.hi - range.lo)) * priceH;
  const xOf = (i: number) => padL + (i + 0.5) * step;

  const priceTicks = [0, 1, 2, 3, 4].map((k) => {
    const v = range.lo + ((range.hi - range.lo) * k) / 4;
    return { v, y: yOf(v) };
  });
  const timeIdx = Array.from(
    new Set(n > 1 ? [0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4)) : [0]),
  );

  const maPoints = ma
    .map((v, i) => (v === null ? null : `${xOf(i)},${yOf(v)}`))
    .filter((p): p is string => p !== null)
    .join(" ");

  const onPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - r.left - padL) / step - 0.5);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const onKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (!n) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      setHover((prev) => Math.min(n - 1, Math.max(0, (prev ?? n - 1) + dir)));
    }
  };

  const hc = hover !== null ? candles[hover] : null;
  const hx = hover !== null ? xOf(hover) : 0;
  const tipLeft = Math.max(4, hx > w / 2 ? hx - 214 : hx + 16);
  const last = candles[n - 1];
  const lastY = last ? yOf(last.c) : 0;

  return (
    <div ref={setNode} dir="ltr" className="absolute inset-0 select-none overflow-hidden">
      {w > 0 && h > 0 && n > 0 ? (
        <svg
          width={w}
          height={h}
          className="block touch-none outline-none focus-visible:ring-1 focus-visible:ring-neon/60"
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {/* grid + price axis */}
          {priceTicks.map((t, k) => (
            <g key={`p${k}`}>
              <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke="rgba(143,168,160,0.12)" strokeWidth={1} />
              <text x={padL - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill={C_FLAT} fontFamily="var(--font-grotesk), ui-monospace, monospace">
                {money(t.v)}
              </text>
            </g>
          ))}

          {/* time axis */}
          {timeIdx.map((i) => (
            <text key={`t${i}`} x={xOf(i)} y={h - 8} textAnchor="middle" fontSize={11} fill={C_FLAT} fontFamily="var(--font-grotesk), ui-monospace, monospace">
              {fmt.format(candles[i].t)}
            </text>
          ))}

          {/* volume: total recorded vault movement per bucket */}
          {showVol
            ? candles.map((c, i) => {
                const vh = (c.volume / maxVolume) * (volH - 2);
                return (
                  <rect
                    key={`v${c.t}-${i}`}
                    x={xOf(i) - bodyW / 2}
                    y={padT + plotH - vh}
                    width={bodyW}
                    height={Math.max(0, vh)}
                    fill={C_FEES}
                  />
                );
              })
            : null}

          {/* candles */}
          {candles.map((c, i) => {
            const color = c.c > c.o ? C_UP : c.c < c.o ? C_DOWN : C_FLAT;
            const yO = yOf(c.o);
            const yC = yOf(c.c);
            const top = Math.min(yO, yC);
            const bh = Math.max(1.5, Math.abs(yO - yC));
            const x = xOf(i);
            return (
              <g key={`c${c.t}-${i}`}>
                <line x1={x} x2={x} y1={yOf(c.h)} y2={yOf(c.l)} stroke={color} strokeWidth={1.2} />
                <rect x={x - bodyW / 2} y={top} width={bodyW} height={bh} rx={1.5} fill={color} fillOpacity={0.92} />
              </g>
            );
          })}

          {/* moving average */}
          {showMa && maPoints ? (
            <polyline points={maPoints} fill="none" stroke={C_MA} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {/* current value marker */}
          {last ? (
            <g>
              <line x1={padL} x2={w - padR} y1={lastY} y2={lastY} stroke={C_UP} strokeOpacity={0.45} strokeDasharray="4 4" strokeWidth={1} />
              <rect x={w - padR + 4} y={lastY - 9} width={60} height={18} rx={5} fill={C_UP} />
              <text x={w - padR + 34} y={lastY + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#04150e" fontFamily="var(--font-grotesk), ui-monospace, monospace">
                {money(last.c)}
              </text>
            </g>
          ) : null}

          {/* crosshair */}
          {hc && hover !== null ? (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={padT} y2={padT + plotH} stroke="rgba(242,251,247,0.35)" strokeWidth={1} strokeDasharray="3 3" />
              <line x1={padL} x2={w - padR} y1={yOf(hc.c)} y2={yOf(hc.c)} stroke="rgba(242,251,247,0.25)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={hx} cy={yOf(hc.c)} r={3.5} fill="#f2fbf7" />
            </g>
          ) : null}
        </svg>
      ) : null}

      {hc && hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 z-20 w-[204px] rounded-xl border border-neon/25 bg-[#050b09]/95 p-3 text-[11px] shadow-2xl backdrop-blur"
          style={{ left: tipLeft }}
        >
          <p className="font-display text-[10px] tracking-[0.12em] text-mint">{fmt.format(hc.t)}</p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-mint">{labels.open}</span>
            <span className="text-end font-display tnum text-white">${money(hc.o)}</span>
            <span className="text-mint">{labels.high}</span>
            <span className="text-end font-display tnum text-white">${money(hc.h)}</span>
            <span className="text-mint">{labels.low}</span>
            <span className="text-end font-display tnum text-white">${money(hc.l)}</span>
            <span className="text-mint">{labels.close}</span>
            <span className={`text-end font-display tnum font-bold ${hc.c >= hc.o ? "text-neon-2" : "text-red-300"}`}>
              ${money(hc.c)}
            </span>
            <span className="text-mint">{labels.volume}</span>
            <span className="text-end font-display tnum text-white">${money(hc.volume)}</span>
            <span className="text-mint">{labels.fees}</span>
            <span className="text-end font-display tnum text-foil">+${money(hc.fees)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ ui */

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" | "foil" }) {
  const color = tone === "up" ? "text-neon-2" : tone === "down" ? "text-red-300" : tone === "foil" ? "text-foil" : "text-white";
  return (
    <div className="bg-[#050b09] px-4 py-3">
      <p className="micro text-mint">{label}</p>
      <p dir="ltr" className={`font-display tnum mt-1 text-start text-[15px] font-bold ${color}`}>
        {value}
      </p>
    </div>
  );
}

function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/* ------------------------------------------------------------ component */

/**
 * Vault candle analytics. Compact card on the home page; full-screen modal
 * with timeframes, MA, transaction volume, crosshair and CSV export. Data is the real
 * recorded vault balance (/api/vault/candles), refreshed every 30 seconds.
 */
export function VaultCandleChart() {
  const { state, demoEnabled } = useApp();
  const { d, t, n, locale } = useI18n();
  const tag = intlTags[locale];
  const [tf, setTf] = useState<Tf>("24h");
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [showMa, setShowMa] = useState(true);
  const [showVol, setShowVol] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const demoData = useMemo(
    () => (demoEnabled ? makeDemoPayload(state, tf) : null),
    [demoEnabled, state, tf],
  );

  // fetch on timeframe change, then poll; stale responses are ignored
  useEffect(() => {
    if (demoEnabled) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/vault/candles?tf=${tf}`, { cache: "no-store" });
        const json = (await res.json()) as Payload;
        if (!alive) return;
        if (json.ok) {
          setData(json);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [tf, demoEnabled]);

  // modal: lock background scroll, close on Escape, move focus into the dialog
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const current = demoEnabled
    ? demoData
    : data && data.tf === tf && data.ok ? data : null;
  const sum = current?.summary ?? null;
  const up = (sum?.change ?? 0) >= 0;
  const changeText = sum
    ? `${up ? "+" : ""}$${money(sum.change)} (${up ? "+" : ""}${sum.changePct.toFixed(2)}%)`
    : "";
  const updatedText = current
    ? new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(current.updatedAt))
    : "";

  const tfLabel: Record<Tf, string> = { round: d.vaultChart.tfRound, "24h": d.vaultChart.tf24h, "30d": d.vaultChart.tfMonth };
  const labels = {
    open: d.vaultChart.tOpen,
    high: d.vaultChart.tHigh,
    low: d.vaultChart.tLow,
    close: d.vaultChart.tClose,
    volume: d.vaultChart.tVolume,
    fees: d.vaultChart.tFees,
  };
  const chartLabel = `${d.vaultChart.title} · ${tfLabel[tf]}`;

  const body = (
    <>
      {current ? (
        current.candles.length ? (
          <CandleChart candles={current.candles} tf={tf} tag={tag} showMa={showMa} showVol={showVol} label={chartLabel} labels={labels} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-mint">{d.vaultChart.empty}</div>
        )
      ) : failed ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-mint">{d.vaultChart.failed}</div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-mint">
          <span className="live-dot me-2 h-2 w-2 rounded-full bg-neon-2" />
          {d.vaultChart.loading}
        </div>
      )}
    </>
  );

  return (
    <section id="vault-chart" className="relative py-16 lg:py-20" aria-labelledby="vault-chart-title">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="panel grain relative overflow-hidden rounded-[24px] p-5 sm:p-6">
          <div className="guilloche pointer-events-none absolute inset-0 opacity-50" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="micro flex items-center gap-2 text-neon-2">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-neon-2" />
                {d.vaultChart.kicker}
              </p>
              <h2 id="vault-chart-title" className="mt-2 text-xl font-black text-white sm:text-2xl">
                {d.vaultChart.title}
              </h2>
              <p className="mt-1 max-w-[56ch] text-[12px] leading-6 text-mint">
                {state?.config.live ? d.vaultChart.subtitle : d.vaultChart.subtitleDemo}
              </p>
            </div>
            <div className="text-end">
              <p className="micro text-mint">{d.vaultChart.now}</p>
              <p dir="ltr" className="font-display tnum text-3xl font-bold text-white">
                {sum ? `$${money(sum.current)}` : "—"}
              </p>
              {sum ? (
                <p dir="ltr" className={`font-display tnum text-[12px] font-bold ${up ? "text-neon-2" : "text-red-300"}`}>
                  {changeText}
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-2xl border border-rule bg-black/30">
            {/* dedicated corner strip: the control never covers candles or the price marker */}
            <div className="flex h-11 items-center justify-end border-b border-rule/60 px-2">
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-label={d.vaultChart.fullscreen}
                title={d.vaultChart.fullscreen}
                className="focus-ring flex items-center gap-1.5 rounded-full border border-neon/40 bg-black/70 px-3 py-1.5 text-[11px] font-bold text-neon-2 transition-colors hover:bg-neon/15"
              >
                <IconExpand />
                <span className="hidden sm:inline">{d.vaultChart.fullscreen}</span>
              </button>
            </div>
            <div className="relative h-[190px] sm:h-[230px]">{body}</div>
          </div>

          <p className="relative mt-3 text-[11px] leading-6 text-mint/70">{d.vaultChart.cardNote}</p>
          <div className="relative mt-3 max-w-xl">
            <OnchainTreasury demo={!state?.config.live} compact />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="vault-modal"
            className="fixed inset-0 z-[88] flex items-center justify-center bg-[#020605]/85 backdrop-blur-md sm:p-6"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="vault-modal-title"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="flex h-[100dvh] w-full max-w-[1400px] flex-col overflow-hidden border border-neon/20 bg-[#050b09] shadow-[0_40px_120px_-30px_rgba(16,226,142,0.35)] sm:h-[min(92vh,900px)] sm:rounded-2xl"
            >
              <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <p className="micro flex items-center gap-2 text-neon-2">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-neon-2" />
                    {d.vaultChart.kicker}
                  </p>
                  <h3 id="vault-modal-title" className="truncate text-lg font-black text-white">
                    {d.vaultChart.title}
                  </h3>
                </div>
                <div className="flex items-center gap-3">
                  {updatedText ? <span className="hidden text-[11px] text-mint/70 md:inline">{t(d.vaultChart.updated, { time: updatedText })}</span> : null}
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={d.vaultChart.close}
                    className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-rule text-mint transition-colors hover:text-white"
                  >
                    <IconClose />
                  </button>
                </div>
              </header>

              <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3 sm:px-6">
                <div role="radiogroup" aria-label={d.vaultChart.tfLabel} className="flex rounded-xl border border-rule bg-black/40 p-1">
                  {TFS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={tf === k}
                      onClick={() => setTf(k)}
                      className={`focus-ring rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
                        tf === k ? "bg-neon/15 text-neon-2" : "text-mint hover:text-white"
                      }`}
                    >
                      {tfLabel[k]}
                    </button>
                  ))}
                </div>

                <div role="group" aria-label={d.vaultChart.toolsLabel} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={showMa}
                    onClick={() => setShowMa((v) => !v)}
                    className={`focus-ring rounded-xl border px-3 py-2 text-[12px] font-bold transition-colors ${
                      showMa ? "border-foil/50 bg-foil/10 text-foil" : "border-rule text-mint hover:text-white"
                    }`}
                  >
                    {d.vaultChart.ma}
                  </button>
                  <button
                    type="button"
                    aria-pressed={showVol}
                    onClick={() => setShowVol((v) => !v)}
                    className={`focus-ring rounded-xl border px-3 py-2 text-[12px] font-bold transition-colors ${
                      showVol ? "border-foil/50 bg-foil/10 text-foil" : "border-rule text-mint hover:text-white"
                    }`}
                  >
                    {d.vaultChart.volume}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => current && downloadCsv(current.candles, tf)}
                  disabled={!current || current.candles.length === 0}
                  className="focus-ring ms-auto rounded-xl border border-neon/40 px-3 py-2 text-[12px] font-bold text-neon-2 transition-colors hover:bg-neon/10 disabled:opacity-40"
                >
                  {d.vaultChart.csv}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-px bg-rule/40 sm:grid-cols-7">
                <Stat label={d.vaultChart.now} value={sum ? `$${money(sum.current)}` : "—"} />
                <Stat
                  label={d.vaultChart.change}
                  value={sum ? `${up ? "+" : ""}$${money(sum.change)} · ${up ? "+" : ""}${sum.changePct.toFixed(2)}%` : "—"}
                  tone={up ? "up" : "down"}
                />
                <Stat label={d.vaultChart.high} value={sum ? `$${money(sum.high)}` : "—"} />
                <Stat label={d.vaultChart.low} value={sum ? `$${money(sum.low)}` : "—"} />
                <Stat label={d.vaultChart.volume} value={sum ? `$${money(sum.volume)}` : "—"} />
                <Stat label={d.vaultChart.feesTotal} value={sum ? `$${money(sum.fees)}` : "—"} tone="foil" />
                <Stat label={d.vaultChart.count} value={sum ? n(sum.count) : "—"} />
              </div>

              <div className="relative min-h-0 flex-1 bg-[#040a08]">{body}</div>

              <footer className="border-t border-rule px-4 py-3 text-[11px] leading-6 text-mint/80 sm:px-6">
                <p>{d.vaultChart.hint}</p>
                <p className="mt-1 text-mint/60">{d.vaultChart.disclaimer}</p>
              </footer>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
