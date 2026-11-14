/**
 * Bursts of spinning gold "$" for real events (wins, prizes, pool filling).
 * Each particle flips in 3D (rotateY with perspective) while flying out —
 * Web Animations API on throw-away nodes: no React state, GPU-only props.
 */

let root: HTMLDivElement | null = null;
function fxRoot() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:96;overflow:hidden;contain:strict";
  document.body.appendChild(root);
  return root;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const GOLD =
  "background:linear-gradient(160deg,#fff6d6 0%,#f6d77f 26%,#e9c46a 48%,#b98c34 72%,#ffe9a8 100%);-webkit-background-clip:text;background-clip:text;color:transparent";
// stacked drop-shadows read as a thick, extruded gold glyph
const DEPTH =
  "filter:drop-shadow(0 1px 0 #b08229) drop-shadow(0 2px 0 #96701f) drop-shadow(0 3px 0 #7c5c18) drop-shadow(0 8px 12px rgba(0,0,0,.45)) drop-shadow(0 0 12px rgba(233,196,106,.45))";

export interface BurstOptions {
  x: number;
  y: number;
  count?: number;
  /** 0.5 = gentle puff, 1 = normal, 1.5 = jackpot */
  power?: number;
}

export function burstDollars({ x, y, count = 12, power = 1 }: BurstOptions) {
  if (typeof window === "undefined" || reduced() || !document.hasFocus()) return;
  const host = fxRoot();
  const n = Math.min(40, Math.max(1, Math.round(count)));
  for (let i = 0; i < n; i++) {
    const size = (20 + Math.random() * 26) * (0.8 + power * 0.25);
    const el = document.createElement("span");
    el.textContent = "$";
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;font:800 ${size}px/1 "Space Grotesk Variable",ui-sans-serif,system-ui,sans-serif;will-change:transform,opacity;${GOLD};${DEPTH}`;
    host.appendChild(el);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
    const dist = (70 + Math.random() * 150) * power;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const flip = (360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1);
    const tilt = (Math.random() - 0.5) * 40;
    const base = "translate(-50%,-50%) perspective(520px)";
    const anim = el.animate(
      [
        { transform: `${base} translate3d(0,0,0) rotateY(0deg) rotateZ(0deg) scale(.2)`, opacity: 0 },
        { transform: `${base} translate3d(${dx * 0.55}px,${dy * 0.55}px,40px) rotateY(${flip * 0.5}deg) rotateZ(${tilt * 0.5}deg) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `${base} translate3d(${dx}px,${dy - 70 * power}px,0) rotateY(${flip}deg) rotateZ(${tilt}deg) scale(.8)`, opacity: 0 },
      ],
      { duration: 1300 + Math.random() * 800, delay: Math.random() * 140, easing: "cubic-bezier(.2,.75,.3,1)", fill: "forwards" },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }
}

/** Burst from the visual centre of an element. */
export function burstFrom(el: Element | null | undefined, opts: Omit<BurstOptions, "x" | "y"> = {}) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burstDollars({ x: r.left + r.width / 2, y: r.top + r.height / 2, ...opts });
}
