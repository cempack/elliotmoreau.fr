"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { SKY_PHASES, type SkyPhase } from "../sky";
import { useWeather } from "../weather";
import { pinnedMs } from "../wallpaper/sunClock";
import { T, createFlight } from "./flight";

/** the wallpaper's art grid (Wallpaper.tsx, gridFor): the flight paints the same pixels, so its last frame lands on them */
function artGrid(w: number, h: number) {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const target = w >= 1800 ? 4 : 3;
  const cell = Math.max(1, Math.round(target * dpr)) / dpr;
  return { W: Math.ceil(w / cell), H: Math.ceil(h / cell), cell };
}

/** the instant the wallpaper is lit for (Wallpaper.tsx, baseMs): now, or the sky someone pinned in Control Center */
function wallpaperMs() {
  let mode: string | null = null;
  try {
    mode = localStorage.getItem("em-sky");
  } catch {}
  return mode && SKY_PHASES.includes(mode as SkyPhase) ? pinnedMs(mode as SkyPhase, new Date()) : Date.now();
}

/**
 * Arrive from space (a first visit, in place of the boot's text): the
 * flight in ./flight, eleven seconds from orbit to the Pont Saint-Pierre,
 * run in a worker on the canvas itself when the browser can (so the page
 * loading underneath never costs it a frame), here otherwise. Nothing is
 * written over it but how to skip it. Any key or tap skips it
 * (the Gate listens). Its last frames are the wallpaper itself, lit for
 * the same instant: `onLand` hands over to the Desktop there, and the
 * canvas fades over pixels it already matches; `onGone` once it has.
 */
export function Arrival({ skipped, onLand, onGone }: { skipped: boolean; onLand: () => void; onGone: () => void }) {
  const { t } = useI18n();
  const s = t.system.intro;
  // today's clouds over Toulouse
  const { kind } = useWeather();
  const near = kind === "clear" ? 1 : kind === "autan" ? 2 : 3;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onLand, onGone });
  useEffect(() => {
    handlers.current = { onLand, onGone };
  });

  // a skip: out at once
  useEffect(() => {
    if (!skipped) return;
    const el = rootRef.current;
    if (!el) return handlers.current.onGone();
    for (const a of el.getAnimations()) a.cancel();
    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
    a.finished.then(
      () => handlers.current.onGone(),
      () => handlers.current.onGone()
    );
  }, [skipped]);

  useEffect(() => {
    const cv = canvasRef.current;
    const root = rootRef.current;
    if (!cv || !root) return;
    const wp = document.querySelector<HTMLElement>(".os-wallpaper");
    const g = artGrid(wp?.clientWidth || window.innerWidth, wp?.clientHeight || window.innerHeight);
    cv.width = g.W;
    cv.height = g.H;
    cv.style.width = `${g.W * g.cell}px`;
    cv.style.height = `${g.H * g.cell}px`;
    const now = wallpaperMs();
    const clock = () => performance.timeOrigin + performance.now();
    // the flight's clock starts when it has been built (the worker says when)
    let start = -1;
    const elapsed = () => (start < 0 ? 0 : clock() - start);

    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      handlers.current.onLand();
      // the canvas already shows the wallpaper: the Desktop comes in over it as it goes
      const a = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: start < 0 ? 400 : Math.max(200, T.end - Math.max(T.land, elapsed())),
        easing: "cubic-bezier(0.45, 0, 0.55, 1)",
        fill: "forwards",
      });
      a.finished.then(
        () => handlers.current.onGone(),
        () => handlers.current.onGone()
      );
    };
    // a flight that never gets going still ends on the Desktop
    const watchdog = window.setTimeout(() => {
      if (start < 0) land();
    }, 4000);

    // the flight: in a worker, on the canvas itself, where the browser can
    let worker: Worker | null = null;
    if (typeof cv.transferControlToOffscreen === "function") {
      try {
        worker = new Worker(new URL("./flight.worker.ts", import.meta.url), { type: "module" });
      } catch {
        worker = null;
      }
      if (worker) {
        const w = worker;
        // whatever goes wrong in there, the visitor still ends on the Desktop
        w.onerror = land;
        w.onmessage = (e: MessageEvent<{ type: string; start?: number }>) => {
          if (e.data.type === "ready" && typeof e.data.start === "number") start = e.data.start;
          else land();
        };
        try {
          const off = cv.transferControlToOffscreen();
          w.postMessage({ type: "start", canvas: off, W: g.W, H: g.H, now, near }, [off]);
        } catch {
          w.terminate();
          worker = null;
        }
      }
    }

    // otherwise, here: the same flight, frame by frame
    let raf = 0;
    if (!worker) {
      const ctx = cv.getContext("2d");
      if (ctx) {
        const flight = createFlight({ W: g.W, H: g.H, now, near });
        const img = ctx.createImageData(g.W, g.H);
        const px = new Uint32Array(img.data.buffer);
        start = clock();
        const tick = () => {
          const t = elapsed();
          flight.draw(t, px);
          ctx.putImageData(img, 0, 0);
          if (t >= T.land) land();
          if (t < T.end + 300) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } else land();
    }

    return () => {
      window.clearTimeout(watchdog);
      cancelAnimationFrame(raf);
      if (worker) {
        worker.postMessage({ type: "stop" });
        worker.terminate();
      }
    };
    // flown once, for the weather it started under
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="os-arrival" aria-hidden>
      <canvas ref={canvasRef} className="os-arrival-canvas" />
      <p className="os-arrival-skip">
        <span className="os-boot-skip">{s.skip}</span>
        <span className="os-boot-skip os-boot-skip--touch">{s.skipTouch}</span>
      </p>
    </div>
  );
}
