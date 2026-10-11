"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { atLocalHour, crossLocal, sunAt, sunDay } from "@/lib/sun";
import { SKY_PHASES, useSky, type SkyMode, type SkyPhase } from "./sky";
import { buildCity, type City } from "./wallpaper/city";
import { lampsAt, relight } from "./wallpaper/light";
import { project, sunScrub, sunSpot } from "./wallpaper/sunClock";
import "./wallpaper.css";

/**
 * CONTRACT (owner: shell/visual agent)
 * Fixed, full-viewport pixel city behind everything (z-index 0): Toulouse
 * from the Pont Saint-Pierre, lit by the real sun over it right now (see
 * ./wallpaper/city and ./wallpaper/light). The scene is built once per
 * viewport in a worker as an indexed buffer; light is one palette lookup
 * per pixel on the main thread (~3 ms at 1440), so it relights each
 * minute in place, cross-fades when the phase is pinned or unpinned, and
 * follows the sun every frame while someone drags it (sunScrub). Crossing
 * civil dusk lights the Pont Neuf's lamps one by one, 40 ms apart, from
 * the Daurade side; dawn puts them out in reverse.
 *
 * Until the canvas lands, a CSS gradient keyed on html[data-sky] (set
 * pre-paint by SKY_SCRIPT) is the sky.
 *
 * Pixels: one art pixel is ~3 CSS px (4 on very wide screens), snapped to
 * a whole number of device pixels so the upscale stays razor-crisp.
 */

const FADE_MS = 700;
const LAMP_STEP_MS = 40;

type Grid = { W: number; H: number; cell: number };

function gridFor(w: number, h: number): Grid {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const target = w >= 1800 ? 4 : 3;
  const cell = Math.max(1, Math.round(target * dpr)) / dpr;
  return { W: Math.ceil(w / cell), H: Math.ceil(h / cell), cell };
}
const sameGrid = (a: Grid | null, b: Grid | null) => !!a && !!b && a.W === b.W && a.H === b.H && a.cell === b.cell;

/** The instant a pinned phase shows today: the middle of its band. */
function pinnedMs(phase: SkyPhase, now: Date) {
  const d = sunDay(now);
  const up = crossLocal(6, -1, now) ?? d.noon - 4;
  const down = crossLocal(6, 1, now) ?? d.noon + 4;
  const h =
    phase === "dawn"
      ? ((d.dawn ?? up - 0.7) + up) / 2
      : phase === "day"
        ? (d.noon + down) / 2
        : phase === "dusk"
          ? (down + (d.dusk ?? down + 1.2)) / 2
          : Math.min(23.75, (d.dusk ?? 21) + 2.5);
  return atLocalHour(h, now).getTime();
}

const baseMs = (mode: SkyMode) => {
  const now = new Date();
  return mode === "auto" ? now.getTime() : pinnedMs(mode, now);
};

/* html[data-sky] as a store: the pre-paint attribute is known before React */
function subscribeSky(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sky"] });
  return () => mo.disconnect();
}
function readSky(): SkyPhase | null {
  const v = document.documentElement.dataset.sky as SkyPhase | undefined;
  return v && SKY_PHASES.includes(v) ? v : null;
}

/* ── the builder: one worker for the session, promise-based ── */

let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, (c: City | null) => void>();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./wallpaper/paint.worker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (e: MessageEvent<{ id: number; city: City }>) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data.city);
    });
    worker.addEventListener("error", () => {
      worker = null;
      for (const done of pending.values()) done(null);
      pending.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}

function buildOnMain(g: Grid) {
  return new Promise<City>((resolve) => {
    const run = () => resolve(buildCity(g.W, g.H));
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 400 });
    else window.setTimeout(run, 16);
  });
}

/** Build off the main thread when possible; a worker that errors or never
    answers falls back to an idle main-thread build. */
function build(g: Grid): Promise<City> {
  const w = getWorker();
  if (!w) return buildOnMain(g);
  return new Promise<City>((resolve) => {
    const id = ++seq;
    let settled = false;
    const settle = (c: City | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      pending.delete(id);
      if (c) resolve(c);
      else buildOnMain(g).then(resolve);
    };
    const watchdog = window.setTimeout(() => settle(null), 2500);
    pending.set(id, settle);
    w.postMessage({ id, W: g.W, H: g.H });
  });
}

// the city for the first viewport, requested while React hydrates
let early: { grid: Grid; city: Promise<City> } | null = null;
if (typeof window !== "undefined") {
  const root = document.documentElement;
  if (root.clientWidth > 0) {
    const grid = gridFor(root.clientWidth, root.clientHeight);
    early = { grid, city: build(grid) };
  }
}

type Life = { key: string; cell: number; W: number; night: boolean; city: City };

export function Wallpaper() {
  const sky = useSky();
  const domSky = useSyncExternalStore(subscribeSky, readSky, () => null);
  // the attribute is set pre-paint; if storage blocked even that, wait for
  // the provider's first read instead of lighting a guessed sky
  const known = domSky != null || sky.hour != null;
  const mode = sky.mode;
  // the provider's minute clock: relight in place each minute
  const minute = sky.hour == null ? null : Math.round(sky.hour * 60);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([null, null]);
  const front = useRef(-1);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [city, setCity] = useState<{ grid: Grid; city: City } | null>(null);
  const night = (mode === "auto" ? sky.live : mode) === "night";
  const life = useMemo<Life | null>(
    () => (city ? { key: `${city.grid.W}x${city.grid.H}@${city.grid.cell}`, cell: city.grid.cell, W: city.grid.W, night, city: city.city } : null),
    [city, night]
  );
  // what the painter needs between frames, without re-rendering
  const live = useRef({ ms: 0, lamps: -1, target: 0, timer: 0, raf: 0, painted: "", reduced: false });

  // viewport size bucket: measured after mount, then on debounced resizes
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let timer = 0;
    const run = () => {
      const g = gridFor(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
      setGrid((prev) => (sameGrid(prev, g) ? prev : g));
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

  // one city per viewport (built in the worker)
  useEffect(() => {
    if (!grid) return;
    let dead = false;
    const p = early && sameGrid(early.grid, grid) ? early.city : build(grid);
    early = null;
    p.then((c) => {
      if (!dead) setCity({ grid, city: c });
    });
    return () => {
      dead = true;
    };
  }, [grid]);

  // the painter
  useEffect(() => {
    if (!city || !known) return;
    const { grid: g, city: c } = city;
    const st = live.current;
    st.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const img = new ImageData(g.W, g.H);
    const out = new Uint32Array(img.data.buffer);
    const view = { W: c.W, hz: c.hz, top: c.top, fov: c.fov, cell: g.cell };

    const publish = (ms: number) => {
      const s = sunAt(ms);
      const p = project(c, s.elevation, s.azimuth);
      sunSpot.set({ view, x: p.x * g.cell, y: p.y * g.cell, r: Math.max(2, Math.round(c.S * 0.027)) * g.cell, ms });
    };

    /** paint `ms` into a canvas: the back one with a cross-fade, or the front in place */
    const paint = (ms: number, fade: boolean) => {
      relight(c, { ms, lamps: Math.max(0, st.lamps) }, out);
      const next = fade || front.current < 0 ? (front.current === 0 ? 1 : 0) : front.current;
      const cv = canvases.current[next];
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      if (cv.width !== g.W || cv.height !== g.H) {
        cv.width = g.W;
        cv.height = g.H;
      }
      cv.style.width = `${g.W * g.cell}px`;
      cv.style.height = `${g.H * g.cell}px`;
      ctx.putImageData(img, 0, 0);
      if (next !== front.current) {
        const prev = front.current >= 0 ? canvases.current[front.current] : null;
        if (prev) delete prev.dataset.front;
        cv.dataset.front = "";
        cv.dataset.on = "";
        front.current = next;
        window.setTimeout(() => {
          if (prev && canvases.current[front.current] !== prev) delete prev.dataset.on;
        }, FADE_MS + 60);
      }
      publish(ms);
    };

    /** lamps step toward the instant's count, 40 ms apart, relighting each */
    const stepLamps = () => {
      st.timer = 0;
      if (st.lamps === st.target) return;
      st.lamps += st.lamps < st.target ? 1 : -1;
      paint(st.ms, false);
      if (st.lamps !== st.target) st.timer = window.setTimeout(stepLamps, LAMP_STEP_MS);
    };

    const show = (ms: number, fade: boolean) => {
      st.ms = ms;
      st.target = lampsAt(ms, c);
      if (st.lamps < 0 || st.reduced || fade) st.lamps = st.target;
      paint(ms, fade);
      if (st.lamps !== st.target && !st.timer) st.timer = window.setTimeout(stepLamps, LAMP_STEP_MS);
    };

    // a pinned/unpinned sky or a new viewport cross-fades; the minute just relights
    const key = `${g.W}x${g.H}@${g.cell}:${mode}`;
    const fade = key !== st.painted;
    st.painted = key;
    const scrub = sunScrub.get();
    show(scrub ?? baseMs(mode), fade && scrub == null);

    // someone holding the sun: follow it every frame
    const unsub = sunScrub.subscribe(() => {
      cancelAnimationFrame(st.raf);
      st.raf = requestAnimationFrame(() => {
        const v = sunScrub.get();
        show(v ?? baseMs(mode), v == null && st.reduced);
      });
    });
    return () => {
      unsub();
      cancelAnimationFrame(st.raf);
      window.clearTimeout(st.timer);
      st.timer = 0;
    };
  }, [city, known, mode, minute]);

  useEffect(() => () => sunSpot.set(null), []);

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
      {life && <WallpaperLife key={life.key} life={life} />}
    </div>
  );
}

/** The few living pixels: positioned on the art grid so they sit exactly on
    the painted stars; animated by CSS only (compositor, no canvas). */
function WallpaperLife({ life }: { life: Life }) {
  const { cell, W, night, city } = life;
  const px = (v: number) => `${v * cell}px`;
  return (
    <div className="os-wallpaper-life" style={{ "--c": `${cell}px`, "--n": W } as React.CSSProperties}>
      {night &&
        city.twinkles.map((s, i) => (
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
      {night && <span className="os-wallpaper-meteor" style={{ left: px(Math.round(W * 0.7)), top: px(Math.round(city.H * 0.075)) }} />}
      <span className="os-wallpaper-plane" data-day={night ? undefined : ""} style={{ top: px(city.plane.y) }}>
        <span className="os-wallpaper-plane-light" />
      </span>
    </div>
  );
}
