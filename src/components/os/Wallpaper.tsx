"use client";

import { useEffect, useRef, useState } from "react";
import { phaseForHour, useSky, type SkyPhase } from "./sky";
import { moonPhase, paintPixels, type Life, type PaintOpts } from "./wallpaper/paint";
import "./wallpaper.css";

/**
 * CONTRACT (owner: shell/visual agent)
 * Fixed, full-viewport pixel landscape behind everything (z-index 0),
 * painted ONCE per (viewport size, sky phase, quarter hour), never a
 * continuous loop, so Liquid Glass can refract it cheaply. Reads `useSky()`;
 * until the Paris hour is known the CSS gradient keyed on html[data-sky]
 * (set pre-paint by SKY_SCRIPT) is already the right sky.
 *
 * The scene (see ./wallpaper/paint.ts): a dithered sky that follows the
 * phase, stars and a milky way at night, the sun or the real moon phase on
 * an arc set by the Paris hour, faceted Alps with alpenglow, the Massif
 * Central puys with a hilltop village whose windows light up at dusk, and
 * a lake mirroring it all. Life is a few CSS-animated pixels (glinting
 * stars, a rare shooting star, an aircraft crossing in pixel steps), all
 * off under reduced motion.
 *
 * Pixels: one art pixel is ~3 CSS px (4 on very wide screens), snapped to
 * a whole number of device pixels so the upscale stays razor-crisp. The
 * backing store is the art resolution, so it never grows with DPR.
 * Painting runs in a Web Worker (main-thread idle fallback), so even the
 * cold first paint never blocks hydration or input.
 */

/** Representative hours when the phase is pinned (or the hour is unknown). */
const DEFAULT_HOUR: Record<SkyPhase, number> = { dawn: 7.35, day: 15.25, dusk: 19.7, night: 23.4 };
const FADE_MS = 700;

type Grid = { W: number; H: number; cell: number };

function measure(el: HTMLElement): Grid {
  const w = el.clientWidth || window.innerWidth;
  const h = el.clientHeight || window.innerHeight;
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const target = w >= 1800 ? 4 : 3;
  // a whole number of device pixels per art pixel: crisp at any DPR
  const cell = Math.max(1, Math.round(target * dpr)) / dpr;
  return { W: Math.ceil(w / cell), H: Math.ceil(h / cell), cell };
}

type Scene = { key: string; cell: number; W: number; life: Life };
type Reply = { id: number; pixels: Uint8ClampedArray<ArrayBuffer>; life: Life };

// one painter for the whole session; null once it has proved unavailable
let painter: Worker | null | undefined;
let seq = 0;
function getPainter() {
  if (painter !== undefined) return painter;
  try {
    painter = new Worker(new URL("./wallpaper/paint.worker.ts", import.meta.url), { type: "module" });
  } catch {
    painter = null;
  }
  return painter;
}

export function Wallpaper() {
  const { phase, hour } = useSky();
  const ready = hour != null;
  const effHour = ready && phaseForHour(hour) === phase ? hour : DEFAULT_HOUR[phase];
  const hourKey = Math.round(effHour * 4) / 4;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const front = useRef(-1);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  // viewport size bucket: measured after mount, then on debounced resizes
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let timer = 0;
    const run = () => {
      const g = measure(el);
      setGrid((prev) => (prev && prev.W === g.W && prev.H === g.H && prev.cell === g.cell ? prev : g));
    };
    const raf = requestAnimationFrame(run);
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 180);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  // one paint per (size, phase, quarter hour), off the main thread; the new
  // frame fades in over the old one, then the old canvas is released
  useEffect(() => {
    if (!ready || !grid) return;
    let dead = false;
    let done = false;
    let release = 0;
    let idle = 0;
    let raf = 0;
    let watchdog = 0;
    const opts: PaintOpts = { W: grid.W, H: grid.H, phase, hour: hourKey, moon: moonPhase(new Date()) };

    const present = (pixels: Uint8ClampedArray<ArrayBuffer>, life: Life) => {
      done = true;
      window.clearTimeout(watchdog);
      raf = requestAnimationFrame(() => {
        if (dead) return;
        const next = front.current === 0 ? 1 : 0;
        const cv = canvases.current[next];
        const ctx = cv?.getContext("2d");
        if (!cv || !ctx) return;
        cv.width = opts.W;
        cv.height = opts.H;
        cv.style.width = `${opts.W * grid.cell}px`;
        cv.style.height = `${opts.H * grid.cell}px`;
        ctx.putImageData(new ImageData(pixels, opts.W, opts.H), 0, 0);
        const prev = front.current >= 0 ? canvases.current[front.current] : null;
        if (prev) delete prev.dataset.front;
        cv.dataset.front = "";
        cv.dataset.on = "";
        front.current = next;
        release = window.setTimeout(() => {
          if (prev && canvases.current[front.current] !== prev) delete prev.dataset.on;
        }, FADE_MS + 60);
        setScene({ key: `${phase}:${opts.W}x${opts.H}:${hourKey}`, cell: grid.cell, W: opts.W, life });
      });
    };
    const onMain = () => {
      const run = () => {
        if (dead || done) return;
        const { pixels, life } = paintPixels(opts);
        present(pixels, life);
      };
      const ric = typeof window.requestIdleCallback === "function";
      idle = ric ? window.requestIdleCallback(run, { timeout: 400 }) : window.setTimeout(run, 16);
    };

    const worker = getPainter();
    const id = ++seq;
    const onMessage = (e: MessageEvent<Reply>) => {
      if (e.data?.id !== id) return;
      present(e.data.pixels, e.data.life);
    };
    const onError = () => {
      painter = null;
      onMain();
    };
    if (worker) {
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id, opts });
      // a worker that never answers (failed chunk, blocked script) must not
      // leave the sky unpainted
      watchdog = window.setTimeout(() => {
        if (!done && !dead) onMain();
      }, 2500);
    } else {
      onMain();
    }
    return () => {
      dead = true;
      worker?.removeEventListener("message", onMessage);
      worker?.removeEventListener("error", onError);
      cancelAnimationFrame(raf);
      window.clearTimeout(release);
      window.clearTimeout(watchdog);
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
    };
  }, [ready, grid, phase, hourKey]);

  return (
    <div ref={rootRef} aria-hidden className="os-wallpaper">
      <canvas
        ref={(n) => {
          canvases.current[0] = n;
        }}
        className="os-wallpaper-canvas"
      />
      <canvas
        ref={(n) => {
          canvases.current[1] = n;
        }}
        className="os-wallpaper-canvas"
      />
      {scene && <WallpaperLife key={scene.key} scene={scene} />}
    </div>
  );
}

/** The few living pixels: positioned on the art grid so they sit exactly on
    the painted stars; animated by CSS only (compositor, no canvas). */
function WallpaperLife({ scene }: { scene: Scene }) {
  const { cell, life, W } = scene;
  const px = (v: number) => `${v * cell}px`;
  return (
    <div className="os-wallpaper-life" style={{ "--c": `${cell}px`, "--n": W } as React.CSSProperties}>
      {life.twinkles.map((s, i) => (
        <span
          key={i}
          className="os-wallpaper-twinkle"
          style={
            {
              left: px(s.x),
              top: px(s.y),
              "--tw": s.c,
              animationDuration: `${s.d}s`,
              animationDelay: `${s.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
      {life.meteor && <span className="os-wallpaper-meteor" style={{ left: px(life.meteor.x), top: px(life.meteor.y) }} />}
      {life.plane && (
        <span className="os-wallpaper-plane" data-day={life.plane.day ? "" : undefined} style={{ top: px(life.plane.y) }}>
          <span className="os-wallpaper-plane-light" />
        </span>
      )}
    </div>
  );
}
