"use client";

import { useEffect } from "react";

/**
 * Samples the frame rate once shortly after load. On weak / software-rendered
 * devices it flags the document with data-perf="low", which switches off the
 * most expensive decorative animations (gradients sweep, breathing shadows)
 * while keeping all content and motion that carries meaning. Re-measures once
 * more after load so a slow first paint doesn't label a fast device.
 */
export function PerfAdaptive() {
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    const t0 = performance.now();
    const sample = (ms: number) =>
      new Promise<number>((res) => {
        frames = 0;
        const start = performance.now();
        const tick = () => {
          frames++;
          performance.now() - start < ms ? (raf = requestAnimationFrame(tick)) : res(Math.round(frames / ((performance.now() - start) / 1000)));
        };
        raf = requestAnimationFrame(tick);
      });

    let alive = true;
    const run = async () => {
      const first = await sample(2500);
      if (!alive) return;
      const second = await sample(2500);
      if (!alive) return;
      const fps = Math.max(first, second);
      document.documentElement.dataset.perf = fps < 30 ? "low" : "high";
    };
    const id = window.setTimeout(() => void run(), 1500);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(id);
    };
  }, []);
  return null;
}
