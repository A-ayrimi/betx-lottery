"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { burstFrom } from "@/lib/dollarFx";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import type { DrawResult } from "@/lib/types";

export function Toasts() {
  const { toast, draw, setDraw } = useApp();
  const { dir } = useI18n();

  return (
    <>
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast}
            initial={{ opacity: 0, y: 22, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-4 bottom-5 z-[80] mx-auto w-fit max-w-[92vw] rounded-xl border border-neon/30 bg-[#0b1512]/95 px-5 py-3 text-sm text-mint shadow-[0_24px_60px_-20px_rgba(16,226,142,0.55)] backdrop-blur"
            dir={dir}
            role="status"
          >
            <span className="text-neon-2">◆</span> {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {draw ? (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#04100c]/85 px-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DrawReveal key={draw.roundId} draw={draw} onClose={() => setDraw(null)} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Suspense reveal: cycles through the round's REAL serials, decelerating,
 * and lands on the actual winner. Purely presentational — the draw is
 * already final and verifiable. No near-miss framing, no "so close!".
 */
function DrawReveal({ draw, onClose }: { draw: DrawResult; onClose: () => void }) {
  const { d, t, href } = useI18n();
  const serials = useMemo(() => (draw.serials?.length ? draw.serials : [draw.winningSerial]), [draw.serials, draw.winningSerial]);
  const [instant] = useState(
    () => serials.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [shown, setShown] = useState(instant ? draw.winningSerial : serials[0]);
  const [done, setDone] = useState(instant);
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (instant) return;
    let i = 0;
    let delay = 55;
    let timer: number;
    const tick = () => {
      i++;
      setShown(serials[i % serials.length]);
      delay *= 1.14;
      if (delay > 420) {
        setShown(draw.winningSerial);
        setDone(true);
        // celebrate only a real win — never dress up a loss as a win
        const lost = (draw.yourTickets ?? 0) > 0 && !draw.youWon;
        if (!lost) burstFrom(slotRef.current, { count: draw.youWon ? 32 : 10, power: draw.youWon ? 1.5 : 0.8 });
        return;
      }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);
    return () => window.clearTimeout(timer);
  }, [draw.winningSerial, draw.youWon, draw.yourTickets, serials, instant]);

  const participated = (draw.yourTickets ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={`relative w-full max-w-md overflow-hidden rounded-2xl border bg-[#0b1512] p-8 text-center ${
        done && draw.youWon ? "border-foil/70 shadow-[0_0_80px_-10px_rgba(233,196,106,0.55)]" : "border-foil/40"
      }`}
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="guilloche pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative">
        <p className="micro text-foil">{d.draw.kicker}</p>
        <h3 className="mt-4 text-2xl font-black leading-tight text-white">{t(d.draw.title, { n: draw.roundId })}</h3>

        {/* the ticket slot */}
        <div ref={slotRef} className="perf stub-fill mx-auto mt-7 w-[78%] rounded-xl px-5 py-5 text-[#161206]">
          <p className="micro text-[#4a3a12]">{done ? d.draw.winner : d.draw.shuffling}</p>
          <p dir="ltr" className={`font-display mt-2 text-3xl font-bold tracking-[0.12em] ${done ? "" : "opacity-80"}`}>
            {shown}
          </p>
        </div>

        <AnimatePresence>
          {done ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {draw.youWon ? (
                <p className="gold-text mt-6 text-4xl font-black">{d.draw.youWon}</p>
              ) : (
                <p className="mt-6 text-2xl font-black text-white">{draw.winnerName}</p>
              )}

              {participated && !draw.youWon ? (
                <div className="mt-4 rounded-xl border border-rule bg-black/25 px-4 py-3 text-start">
                  <p className="text-sm font-bold text-white">{d.draw.lost}</p>
                  <p className="mt-1 text-[13px] leading-6 text-mint">{t(d.draw.lostBody, { n: draw.yourTickets ?? 0 })}</p>
                </div>
              ) : null}

              {draw.demo ? (
                <p className="mt-4 rounded-xl border border-foil/30 bg-foil/[0.06] px-4 py-3 text-[12px] leading-6 text-mint">
                  {d.draw.demoNotice}
                </p>
              ) : null}

              <div className="mt-6 grid grid-cols-2 gap-3 text-start">
                <div className="panel rounded-xl p-4">
                  <p className="micro text-mint">PRIZE</p>
                  <p dir="ltr" className="font-display tnum mt-1 text-start text-2xl text-white">${money(draw.prize)}</p>
                </div>
                <div className="panel rounded-xl p-4">
                  <p className="micro text-mint">HOUSE EDGE</p>
                  <p dir="ltr" className="font-display tnum mt-1 text-start text-2xl text-foil">${money(draw.fee)}</p>
                </div>
              </div>

              <button onClick={onClose} className="btn-neon focus-ring mt-7 w-full rounded-xl px-6 py-3.5 text-base font-bold">
                OK
              </button>
              {!draw.demo ? (
                <a href={href(`/verify/${draw.roundId}`)} className="mt-3 inline-block text-[12px] text-neon-2 hover:underline">
                  {d.board.verify}
                </a>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
