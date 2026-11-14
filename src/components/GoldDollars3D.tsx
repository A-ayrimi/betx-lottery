"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Background layer of 3D gold dollar signs. Three.js is loaded lazily, only
 * when the section scrolls into view, so it never delays the first paint.
 */
export function GoldDollars3D({
  count = 20,
  seed = 7,
  side = "end",
  parallax = false,
  className = "",
}: {
  count?: number;
  seed?: number;
  side?: "end" | "both";
  parallax?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { dir } = useI18n();

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      if (!webglAvailable()) return;
      try {
        const { createDollarScene } = await import("@/lib/dollarScene");
        if (disposed) return;
        cleanup = createDollarScene(host, { count, seed, side, dir, parallax });
      } catch (e) {
        console.warn("3D dollars unavailable", e);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.12)) {
          io.disconnect();
          void start();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(host);

    return () => {
      disposed = true;
      io.disconnect();
      cleanup?.();
    };
  }, [count, seed, side, dir, parallax]);

  return <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} />;
}
