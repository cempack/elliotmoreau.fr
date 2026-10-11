"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parisHour, phaseForHour, SKY_PHASES, useSky, type SkyPhase } from "./sky";
import { moonPhase, paintPixels, type Life, type PaintOpts } from "./wallpaper/paint";
import "./wallpaper.css";

/**
 * CONTRACT (owner: shell/visual agent)
 * Fixed, full-viewport pixel landscape behind everything (z-index 0),
 * painted ONCE per (viewport size, sky phase, quarter hour), never a
 * continuous loop, so Liquid Glass can refract it cheaply. Follows
 * html[data-sky] (set pre-paint by SKY_SCRIPT, kept in sync by the
 * SkyProvider), so the first paint never waits for the provider; until the
 * canvas lands, a CSS gradient keyed on the same attribute is the sky.
 *
 * The scene (see ./wallpaper/paint.ts): a dithered sky that follows the
 * phase, stars and a milky way at night, the sun or the real moon phase on
 * an arc set by the Toulouse hour, faceted Alps with alpenglow, the Massif
 * Central puys with a hilltop village whose windows light up at dusk, and
 * a lake mirroring it all. Life is a few CSS-animated pixels (glinting
 * stars, a rare shooting star, an aircraft crossing in pixel steps), all
 * off under reduced motion.
 *
 * Pixels: one art pixel is ~3 CSS px (4 on very wide screens), snapped to
 * a whole number of device pixels so the upscale stays razor-crisp. The
 * backing store is the art resolution, so it never grows with DPR.
 *
 * Cost: painting runs in a Web Worker that boots, and starts on the first
 * frame, as soon as this module loads (in parallel with hydration), with a
 * main-thread idle fallback. A new frame cross-fades over the old one.
 */

/** Representative hours when the phase is pinned (or the hour is unknown). */
const DEFAULT_HOUR: Record<SkyPhase, number> = { dawn: 7.35, day: 15.25, dusk: 19.7, night: 23.4 };
const FADE_MS = 700;

type Grid = { W: number; H: number; cell: number };
type Frame = { pixels: Uint8ClampedArray<ArrayBuffer>; life: Life };
type Scene = { key: string; cell: number; W: number; life: Life };

function gridFor(w: number, h: number): Grid {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const target = w >= 1800 ? 4 : 3;
  // a whole number of device pixels per art pixel: crisp at any DPR
  const cell = Math.max(1, Math.round(target * dpr)) / dpr;
  return { W: Math.ceil(w / cell), H: Math.ceil(h / cell), cell };
}

/** The light for a phase: the Toulouse clock when it agrees with the phase, a
    representative hour when the phase is pinned. Quarter-hour buckets. */
function lightFor(phase: SkyPhase, hour: number | null) {
  const h = Math.round((hour ?? parisHour()) * 4) / 4;
  return phaseForHour(h) === phase ? h : DEFAULT_HOUR[phase];
}
const keyFor = (phase: SkyPhase, g: Grid, hour: number) => `${phase}:${g.W}x${g.H}@${g.cell}:${hour}`;

/* html[data-sky] as a store: correct from the first client render */
function subscribeSky(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sky"] });
  return () => mo.disconnect();
}
function readSky(): SkyPhase | null {
  const v = document.documentElement.dataset.sky as SkyPhase | undefined;
  return v && SKY_PHASES.includes(v) ? v : null;
}

/* ── the painter: one worker for the session, promise-based ── */

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, (f: Frame | null) => void>();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./wallpaper/paint.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<Frame & { id: number }>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.({ pixels: e.data.pixels, life: e.data.life });
    });
    worker.addEventListener("error", () => {
      // the worker is gone: everything in flight falls back to the main thread
      worker = null;
      for (const done of pending.values()) done(null);
      pending.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}

function paintOnMain(opts: PaintOpts) {
  return new Promise<Frame>((resolve) => {
    const run = () => resolve(paintPixels(opts));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 400 });
    else window.setTimeout(run, 16);
  });
}

/** Paint off the main thread when possible; a worker that errors or never
    answers (failed chunk, blocked script) falls back to an idle main-thread
    paint, so the sky is never left unpainted. */
function paint(opts: PaintOpts): Promise<Frame> {
  const w = getWorker();
  if (!w) return paintOnMain(opts);
  return new Promise<Frame>((resolve) => {
    const id = ++seq;
    let settled = false;
    const settle = (f: Frame | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      pending.delete(id);
      if (f) resolve(f);
      else paintOnMain(opts).then(resolve);
    };
    const watchdog = window.setTimeout(() => settle(null), 2500);
    pending.set(id, settle);
    w.postMessage({ id, opts });
  });
}

const optsFor = (phase: SkyPhase, g: Grid, hour: number): PaintOpts => ({
  W: g.W,
  H: g.H,
  phase,
  hour,
  moon: moonPhase(new Date()),
});

// first frame, requested while React hydrates: the pre-paint attribute and
// the viewport already say everything the painter needs
let early: { key: string; frame: Promise<Frame> } | null = null;
if (typeof window !== "undefined") {
  const phase = readSky();
  const root = document.documentElement;
  if (phase && root.clientWidth > 0) {
    const g = gridFor(root.clientWidth, root.clientHeight);
    const hour = lightFor(phase, null);
    early = { key: keyFor(phase, g, hour), frame: paint(optsFor(phase, g, hour)) };
  }
}

export function Wallpaper() {
  const sky = useSky();
  const domSky = useSyncExternalStore(subscribeSky, readSky, () => null);
  const phase = domSky ?? sky.phase;
  // the attribute is set pre-paint; if storage blocked even that, wait for
  // the provider's first read instead of painting a guessed sky
  const known = domSky != null || sky.hour != null;
  // the provider's minute clock, bucketed to the quarter hour (null until it
  // has read the time; the paint reads the clock itself meanwhile)
  const hourKey = sky.hour == null ? null : Math.round(sky.hour * 4) / 4;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const front = useRef(-1);
  const painted = useRef("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  // viewport size bucket: measured after mount, then on debounced resizes
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let timer = 0;
    const run = () => {
      const g = gridFor(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
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

  // one paint per (size, phase, quarter hour); the new frame fades in over
  // the old one, then the old canvas is released
  useEffect(() => {
    if (!grid || !known) return;
    const hour = lightFor(phase, hourKey);
    const key = keyFor(phase, grid, hour);
    if (key === painted.current) return;
    let dead = false;
    let raf = 0;
    let release = 0;
    const frame = early?.key === key ? early.frame : paint(optsFor(phase, grid, hour));
    early = null;
    frame.then(({ pixels, life }) => {
      if (dead) return;
      raf = requestAnimationFrame(() => {
        if (dead) return;
        const next = front.current === 0 ? 1 : 0;
        const cv = canvases.current[next];
        const ctx = cv?.getContext("2d");
        if (!cv || !ctx) return;
        cv.width = grid.W;
        cv.height = grid.H;
        cv.style.width = `${grid.W * grid.cell}px`;
        cv.style.height = `${grid.H * grid.cell}px`;
        ctx.putImageData(new ImageData(pixels, grid.W, grid.H), 0, 0);
        const prev = front.current >= 0 ? canvases.current[front.current] : null;
        if (prev) delete prev.dataset.front;
        cv.dataset.front = "";
        cv.dataset.on = "";
        front.current = next;
        painted.current = key;
        release = window.setTimeout(() => {
          if (prev && canvases.current[front.current] !== prev) delete prev.dataset.on;
        }, FADE_MS + 60);
        setScene({ key, cell: grid.cell, W: grid.W, life });
      });
    });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(release);
    };
  }, [known, grid, phase, hourKey]);

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
