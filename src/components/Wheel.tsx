"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "./AppProvider";
import { money } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import { WHEEL_SECTORS } from "@/lib/wheel";
import { burstFrom } from "@/lib/dollarFx";

export function Wheel() {
  const { state, spin, setToast, refresh } = useApp();
  const { d, t, n } = useI18n();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<number[]>([]);
  const timers = useRef<number[]>([]);
  const wheelRef = useRef<HTMLDivElement>(null);

  const user = state?.user;
  const [now, setNow] = useState(0);
  const target = user?.nextSpinAt ? new Date(user.nextSpinAt).getTime() : 0;
  useEffect(() => {
    if (!target) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [target]);
  const left = (() => {
    if (!target || !now) return "";
    const ms = Math.max(0, target - now);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s2 = Math.floor((ms % 60000) / 1000);
    return [h, m, s2].map((x) => String(x).padStart(2, "0")).join(":");
  })();
  const canSpin = user ? user.canSpin : true;
  const sectors = WHEEL_SECTORS;

  const slices = useMemo(
    () =>
      sectors.map((s, i) => {
        const a0 = (i * 360) / sectors.length;
        const a1 = ((i + 1) * 360) / sectors.length;
        return { ...s, a0, a1, mid: (a0 + a1) / 2 };
      }),
    [sectors],
  );

  const doSpin = async () => {
    if (spinning) return;
    if (!user) {
      setToast(d.wheel.needLogin);
      return;
    }
    setSpinning(true);
    setPrize(null);
    const res = await spin();
    if (!res.ok || res.index === undefined) {
      setSpinning(false);
      return;
    }
    const i = res.index;
    const step = (360 - ((rotation + i * (360 / sectors.length) + 360 / sectors.length / 2) % 360)) % 360;
    const next = rotation + 360 * 5 + step;
    setRotation(next);

    const t = window.setTimeout(() => {
      setSpinning(false);
      setPrize(res.prize ?? 0);
      const won = res.prize ?? 0;
      if (won > 0) burstFrom(wheelRef.current, { count: won >= 1 ? 24 : 12, power: won >= 1 ? 1.3 : 0.85 });
      setConfetti(Array.from({ length: 26 }, (_, k) => k));
      refresh();
      const t2 = window.setTimeout(() => setConfetti([]), 2600);
      timers.current.push(t2);
    }, 4300);
    timers.current.push(t);
  };

  return (
    <section id="wheel" className="relative overflow-hidden py-20 lg:py-28">
      <div className="guilloche pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
        {/* wheel */}
        <div ref={wheelRef} className="relative mx-auto w-full max-w-[460px]">
          {confetti.map((k) => (
            <span
              key={k}
              className="confetti"
              style={{
                left: `${(k * 3.9 + 4) % 100}%`,
                background: k % 3 === 0 ? "#E9C46A" : k % 3 === 1 ? "#35FFB0" : "#F6E3AE",
                animationDuration: `${1.8 + (k % 5) * 0.32}s`,
                animationDelay: `${(k % 7) * 0.08}s`,
              }}
            />
          ))}

          {/* hooter */}
          <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
              <path d="M17,32 L6,6 A2,2 0 0 1 8,3 L26,3 A2,2 0 0 1 28,6 Z" fill="#E9C46A" />
              <path d="M17,26 L11,9 L23,9 Z" fill="#12100A" opacity="0.65" />
            </svg>
          </div>

          <div
            className="wheel-shadow relative aspect-square w-full rounded-full"
            style={{
              transition: spinning ? "transform 4200ms cubic-bezier(0.12,0.72,0.06,1)" : "none",
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <svg viewBox="0 0 200 200" className="h-full w-full">
              <defs>
                <radialGradient id="wheel-hub" cx="50%" cy="40%" r="70%">
                  <stop offset="0%" stopColor="#17322a" />
                  <stop offset="100%" stopColor="#08120f" />
                </radialGradient>
              </defs>

              {slices.map((s, i) => {
                const r = 96;
                const cx = 100;
                const cy = 100;
                const p = (deg: number) => [
                  cx + r * Math.sin((deg * Math.PI) / 180),
                  cy - r * Math.cos((deg * Math.PI) / 180),
                ];
                const [x0, y0] = p(s.a0);
                const [x1, y1] = p(s.a1);
                const big = s.a1 - s.a0 > 180 ? 1 : 0;
                const gold = s.value >= 1;
                return (
                  <g key={i}>
                    <path
                      d={`M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${big} 1 ${x1},${y1} Z`}
                      fill={gold ? "#E9C46A" : i % 2 === 0 ? "#0d2a22" : "#123a2c"}
                      stroke="#0b1512"
                      strokeWidth="1"
                    />
                    <g transform={`rotate(${s.mid} ${cx} ${cy})`}>
                      <text
                        x={cx}
                        y={cy - 66}
                        textAnchor="middle"
                        fontSize="15"
                        fontWeight="700"
                        fill={gold ? "#12100A" : "#8FA8A0"}
                        fontFamily="var(--font-display)"
                      >
                        {s.label}
                      </text>
                    </g>
                  </g>
                );
              })}

              <circle cx="100" cy="100" r="97" fill="none" stroke="#E9C46A" strokeWidth="2.5" opacity="0.85" />
              <circle cx="100" cy="100" r="88" fill="none" stroke="#0b1512" strokeWidth="1.5" />
              <circle cx="100" cy="100" r="30" fill="url(#wheel-hub)" stroke="#E9C46A" strokeWidth="2" />
            </svg>
          </div>

          <button
            onClick={doSpin}
            disabled={spinning || !canSpin}
            className="btn-foil focus-ring absolute left-1/2 top-1/2 z-10 h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-full text-base font-black disabled:opacity-70"
          >
            {spinning ? "..." : canSpin ? d.wheel.spin : d.wheel.tomorrow}
          </button>
        </div>

        {/* copy */}
        <div>
          <p className="micro text-neon-2">DAILY LUCKY WHEEL · FREE</p>
          <h2 className="mt-4 text-[clamp(2.1rem,5.2vw,3.7rem)] font-black leading-[1.1] text-white">
            {d.wheel.title1}
            <br />
            <span className="gold-text">{d.wheel.titleGold}</span>
          </h2>
          <p className="mt-5 max-w-[56ch] text-[16px] leading-9 text-mint">
            {d.wheel.body}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { v: "$0.10", l: d.wheel.tierBase },
              { v: "$0.75", l: d.wheel.tierSilver },
              { v: "$2.00", l: d.wheel.tierGold },
              { v: "$5.00", l: d.wheel.tierJackpot },
            ].map((c) => (
              <div key={c.v} className="panel rounded-2xl px-4 py-4 text-center">
                <p dir="ltr" className="font-display tnum text-xl font-bold text-foil">
                  {c.v}
                </p>
                <p className="mt-1 text-[11px] text-mint">{c.l}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={doSpin}
              disabled={spinning || !canSpin}
              className="btn-neon focus-ring rounded-2xl px-8 py-4 text-base font-bold disabled:opacity-55"
            >
              {spinning
                ? d.wheel.spinning
                : canSpin
                  ? d.wheel.spinBtn
                  : d.wheel.nextTomorrow}
            </button>
            {user ? (
              <p className="text-sm text-mint">
                {d.wheel.yourBalance}{" "}
                <span dir="ltr" className="font-display tnum text-white">
                  ${money(user.balance)}
                </span>
                {user.bonusSpins > 0 ? (
                  <span className="ms-2 rounded-full border border-foil/40 bg-foil/10 px-2.5 py-1 text-[11px] text-foil">
                    {t(d.wheel.bonus, { n: n(user.bonusSpins) })}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-mint">
                {d.wheel.loginHint}
              </p>
            )}
          </div>

          {user && !canSpin && left ? (
            <p className="mt-4 text-sm text-mint">
              {t(d.wheel.nextIn, { time: "" })}
              <span dir="ltr" className="font-display tnum ms-1 text-foil">{left}</span>
            </p>
          ) : null}

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-7 rounded-2xl border border-rule bg-white/[0.03] px-5 py-4 text-[13px] leading-8 text-mint"
          >
            <span className="text-neon-2">◆</span>{" "}
            {t(d.wheel.floor, { amount: `$${money(state?.vault.initialCapital ?? 20)}` })}
          </motion.p>

          {prize !== null ? (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 flex items-center gap-4 rounded-2xl border border-foil/40 bg-foil/[0.1] px-6 py-5"
            >
              <span className="gold-text font-display tnum text-4xl font-bold">
                +${money(prize)}
              </span>
              <p className="text-sm leading-7 text-mint">
                {d.wheel.won}
              </p>
            </motion.div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
