import {
  ACESFilmicToneMapping,
  NoToneMapping,
  AmbientLight,
  Color,
  LinearSRGBColorSpace,
  DirectionalLight,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Fog,
  InstancedMesh,
  MathUtils,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

/**
 * Real-time 3D field of extruded, bevelled, metallic gold dollar signs.
 * Client-only (loaded lazily). One InstancedMesh = one draw call.
 */

// Material Design "attach_money" glyph — Apache License 2.0
const DOLLAR_PATH =
  "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z";

export interface DollarSceneOptions {
  count: number;
  seed: number;
  /** "end" keeps most dollars on the image side, away from the text column */
  side: "end" | "both";
  dir: "ltr" | "rtl";
  parallax: boolean;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dollarGeometry(lite: boolean) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${DOLLAR_PATH}"/></svg>`;
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes());
  const geo = new ExtrudeGeometry(shapes, {
    depth: 2.4,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelSegments: lite ? 2 : 5,
    curveSegments: lite ? 8 : 16,
  });
  geo.center();
  geo.rotateX(Math.PI); // SVG is y-down: rotate (not mirror) so faces keep their winding
  geo.scale(1 / 18, 1 / 18, 1 / 18); // glyph is ~18 units tall -> ~1 world unit
  return geo;
}

/**
 * Detect machines without a GPU (VMs, remote desktops, CI). Those rasterise
 * WebGL on the CPU, so we must start at minimum quality with no MSAA instead
 * of starting high and stalling the page for seconds.
 */
function detectSoftwareGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return true;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    const rendererStr = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|software|mesa offscreen|basic render|angle \(software/i.test(rendererStr);
  } catch {
    return false;
  }
}

export function createDollarScene(host: HTMLElement, opts: DollarSceneOptions): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = window.matchMedia("(max-width: 640px), (pointer: coarse)").matches;
  const software = detectSoftwareGL();
  // no GPU → fewer, cheaper instances (hardware GPUs keep the full count)
  const count = Math.max(6, Math.round((lite ? opts.count * 0.5 : opts.count) * (software ? 0.55 : 1)));

  const renderer = new WebGLRenderer({ antialias: !lite && !software, alpha: true, powerPreference: "low-power" });
  // adaptive resolution: steps down on slow GPUs and (once) back up on fast ones,
  // so the field stays smooth on cheap phones as well as on desktops
  const baseDpr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.6);
  // strictly descending ladder (a step-down must never raise the resolution)
  const endDpr = software ? 0.25 : 0.4;
  const DPR_STEPS = [baseDpr, baseDpr * 0.72, baseDpr * 0.55, endDpr].filter(
    (v, i, arr) => i === 0 || v < arr[i - 1] - 0.01,
  );
  // no GPU → start at the cheapest step instead of degrading after a stall
  let dprIdx = software ? DPR_STEPS.length - 1 : 0;
  renderer.setPixelRatio(DPR_STEPS[dprIdx]);
  renderer.outputColorSpace = SRGBColorSpace;
  // ACES tone mapping + environment reflections are per-fragment expensive;
  // on a CPU rasteriser we trade a little richness for a usable frame rate.
  renderer.toneMapping = software ? NoToneMapping : ACESFilmicToneMapping;
  renderer.toneMappingExposure = software ? 1.0 : 1.15;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new Scene();
  const pmrem = software ? null : new PMREMGenerator(renderer);
  const envTex = pmrem ? pmrem.fromScene(new RoomEnvironment(), 0.04).texture : null;
  if (envTex) scene.environment = envTex;
  scene.fog = new Fog(0x060a09, 12.5, 31); // far dollars sink into the dark backdrop

  const camera = new PerspectiveCamera(38, 1, 0.1, 80);
  const CAM_Z = 13.2;
  camera.position.set(0, 0, CAM_Z);

  // punchier lighting: warm key + brand emerald rim + cool back-fill for edge pop
  scene.add(new AmbientLight(0xfff3dd, 0.34));
  const key = new DirectionalLight(0xfff0c8, 3.1);
  key.position.set(5, 7, 9);
  scene.add(key);
  const rim = new DirectionalLight(0x35ffb0, 3.4); // emerald rim — the BETX accent
  rim.position.set(-7, -3, -5);
  scene.add(rim);
  const fill = new DirectionalLight(0x8fb4ff, 0.85);
  fill.position.set(3, -5, -7);
  scene.add(fill);

  const geometry = dollarGeometry(lite);
  const material = new MeshStandardMaterial({
    color: 0xffcf6e, // richer gold so it still reads behind the dark scrim
    metalness: software ? 0.35 : 1,
    roughness: software ? 0.5 : 0.17, // tighter highlights = visibly shinier
    envMapIntensity: software ? 0 : 1.9,
  });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // per-instance tint: mostly warm gold, a few emerald-tinted for brand variety
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    const k = i % 7 === 0 ? [0.6, 1, 0.86] : i % 5 === 0 ? [1, 0.84, 0.52] : [1, 1, 1];
    const shade = 0.78 + (((i * 37) % 100) / 100) * 0.32;
    tint.setRGB(k[0] * shade, k[1] * shade, k[2] * shade, LinearSRGBColorSpace);
    mesh.setColorAt(i, tint);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const rand = mulberry32(opts.seed);
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
  const halfH = (z: number) => tanHalf * (CAM_Z - z);
  let aspect = 1;
  // size & speed are defined in screen pixels so tall (mobile) sections don't blow them up
  const TARGET_PX = lite ? 58 : 88;
  let pxPerUnit = 80;

  const pickX = () => {
    let f = opts.side === "end" ? (rand() < 0.72 ? 0.52 + rand() * 0.45 : 0.03 + rand() * 0.47) : 0.04 + rand() * 0.92;
    if (opts.side === "end" && opts.dir === "rtl") f = 1 - f;
    return f;
  };
  const items = Array.from({ length: count }, () => {
    const z = -10 + rand() * 13;
    return {
      z,
      xf: pickX(),
      y: (rand() * 2 - 1) * halfH(z),
      speedPx: lite ? 32 + rand() * 34 : 42 + rand() * 48,
      spin: (0.55 + rand() * 1.05) * (rand() < 0.5 ? -1 : 1),
      phase: rand() * Math.PI * 2,
      scale: 0.75 + rand() * 0.5,
      // vertical bob so each dollar breathes instead of only drifting up
      bobAmp: 0.1 + rand() * 0.16,
      bobSpeed: 0.55 + rand() * 0.8,
      // depth factor: nearest dollars read bigger and feel closer
      near: (z + 10) / 13,
    };
  });

  const dummy = new Object3D();
  let t = 0;
  const place = () => {
    for (let i = 0; i < count; i++) {
      const it = items[i];
      const hh = halfH(it.z);
      const bob = Math.sin(t * it.bobSpeed + it.phase) * it.bobAmp;
      dummy.position.set((it.xf * 2 - 1) * hh * aspect, it.y + bob, it.z);
      // three axes of motion: wobble, spin, roll
      dummy.rotation.set(
        Math.sin(t * 0.6 + it.phase) * 0.3,
        it.spin * t + it.phase,
        Math.sin(t * 0.8 + it.phase) * 0.22,
      );
      const depthBoost = 1 + it.near * 0.55; // nearest dollars pop forward
      dummy.scale.setScalar((it.scale * TARGET_PX * depthBoost) / pxPerUnit);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    aspect = w / h;
    pxPerUnit = h / (2 * tanHalf * CAM_Z);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (reduced) {
      place();
      renderer.render(scene, camera);
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // pointer parallax: the camera drifts, so near dollars shift more than far ones
  let px = 0, py = 0, cx = 0, cy = 0;
  const parallaxHost = host.parentElement;
  const onMove = (e: PointerEvent) => {
    if (!parallaxHost) return;
    const r = parallaxHost.getBoundingClientRect();
    px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    py = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  if (opts.parallax && !lite && parallaxHost) parallaxHost.addEventListener("pointermove", onMove);

  let raf = 0;
  let last = performance.now();
  let onScreen = true;
  let lost = false;
  let frameMs = 0;
  let frameCount = 0;
  let windowStart = performance.now();
  let steppedUp = false; // at most one quality increase per session (no oscillation)

  const setQuality = (idx: number) => {
    dprIdx = idx;
    renderer.setPixelRatio(DPR_STEPS[idx]);
    resize();
  };

  const MIN_FRAME_MS = software ? 80 : 0; // ~12fps governor when there is no GPU

  const frame = (now: number) => {
    raf = 0;
    if (MIN_FRAME_MS && now - last < MIN_FRAME_MS) {
      schedule();
      return;
    }
    const ms = now - last;
    const dt = Math.min(software ? 0.12 : 0.05, ms / 1000);
    frameMs += ms;
    frameCount += 1;
    // decide after 45 frames OR after ~1.2s, so a very slow device degrades fast
    const elapsed = now - windowStart;
    if (frameCount >= 45 || (elapsed > 1200 && frameCount >= 5)) {
      const avg = frameMs / frameCount;
      // step down quickly when struggling; only step back up after a long,
      // reliable sample so a couple of fast frames can't cause oscillation
      if (avg > 42 && dprIdx < DPR_STEPS.length - 1) setQuality(dprIdx + 1);
      else if (elapsed > 6000 && frameCount >= 40 && avg < 16 && dprIdx > 0 && !steppedUp) {
        steppedUp = true;
        setQuality(dprIdx - 1);
      }
      frameMs = 0;
      frameCount = 0;
      windowStart = now;
    }
    last = now;
    t += dt;
    cx += (px - cx) * 0.045;
    cy += (py - cy) * 0.045;
    // slow autonomous drift + pointer parallax: the field breathes even when idle
    camera.position.x = cx * 1.2 + Math.sin(t * 0.16) * 0.42;
    camera.position.y = -cy * 0.65 + Math.cos(t * 0.12) * 0.26;
    camera.lookAt(0, 0, 0);
    camera.rotation.z = Math.sin(t * 0.1) * 0.022; // micro-roll for a handheld feel
    for (const it of items) {
      it.y += (it.speedPx / pxPerUnit) * dt;
      const hh = halfH(it.z);
      if (it.y > hh + 1.2) {
        it.y = -hh - 1.2;
        it.xf = pickX();
      }
    }
    place();
    renderer.render(scene, camera);
    schedule();
  };
  const schedule = () => {
    if (reduced || lost || raf || !onScreen || document.visibilityState !== "visible") return;
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    last = performance.now();
    schedule();
  };

  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    if (onScreen) wake();
  });
  io.observe(host);
  document.addEventListener("visibilitychange", wake);

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  if (reduced) {
    place();
    renderer.render(scene, camera);
  } else {
    wake();
  }

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener("visibilitychange", wake);
    parallaxHost?.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("webglcontextlost", onLost);
    geometry.dispose();
    material.dispose();
    envTex?.dispose();
    pmrem?.dispose();
    mesh.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
