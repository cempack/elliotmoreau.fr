"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { project as projectFling, spring, springFrom } from "@/lib/motion";
import { atLocalHour, fmtHour, localHour, moonPhase, phaseOf, sunAt, sunDay, type SkyPhase } from "@/lib/sun";
import { buildCity, type City } from "../wallpaper/city";
import { lampsAt, relight } from "../wallpaper/light";
import { pinnedMs } from "../wallpaper/sunClock";
import type { SkyMode } from "../sky";

/**
 * Hold the sun: Control Center's sky. The wallpaper's city in miniature
 * (the same painter, 36 cells tall, sky columns added to fill the tile),
 * with today's real path of the sun across it: x is the time of day,
 * y the computed altitude, so it crosses the skyline at today's sunrise
 * and sunset (printed there), runs flat in December and high in June, and
 * dips under the city through the night. A ghost marks where the sun
 * really is (Live); four notches mark the hours the wallpaper uses for
 * pinned phases.
 *
 * Grab the sun and it follows the curve, the little city relighting under
 * it; let go and the throw is projected to one of the five detents, the
 * sun travels there along the path (a bounce only after a real throw) and
 * the sky lands on it: Live on the ghost, a phase on a notch. The wallpaper
 * repaints once, on landing. The chips stay the accessible control; this
 * mirrors them (aria-hidden).
 */

const H = 36;
const MAX_ALT = 70;
const FLING = 900;
const PHASES: SkyPhase[] = ["dawn", "day", "dusk", "night"];

const SUN = ["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."];
const HALO = ["...#.#...", "..#...#..", ".#.....#.", "#.......#", ".........", "#.......#", ".#.....#.", "..#...#..", "...#.#..."];
const RING = ["..###..", ".#...#.", "#.....#", "#.....#", "#.....#", ".#...#.", "..###.."];
const cellsOf = (rows: string[], ox = 0, oy = 0) => {
  const out: [number, number][] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === "#") out.push([x + ox, y + oy]);
  });
  return out;
};
const SUN_CELLS = cellsOf(SUN, -3, -3);
const HALO_CELLS = cellsOf(HALO, -4, -4);
const RING_CELLS = cellsOf(RING, -3, -3);

/** a 7×7 moon in its real phase, lit cells and dark cells */
function moonCells(phase: number) {
  const lit: [number, number][] = [];
  const dark: [number, number][] = [];
  const k = Math.cos(2 * Math.PI * Math.min(0.88, Math.max(0.12, phase)));
  const waxing = phase < 0.5;
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const nx = x / 3.3;
      const ny = y / 3.3;
      if (nx * nx + ny * ny > 1) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      ((waxing ? nx > k * half : nx < -k * half) ? lit : dark).push([x, y]);
    }
  }
  return { lit, dark };
}

type Detent = { mode: SkyMode; hour: number };

export function SkyView({ mode, onPick, labels }: { mode: SkyMode; onPick: (m: SkyMode) => void; labels: Record<SkyPhase, string> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ W: number; cell: number } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // the sun's hour while it is held or travelling; null = resting on the mode
  const [hold, setHold] = useState<number | null>(null);
  const [grabbed, setGrabbed] = useState(false);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const g = useRef<{ pid: number; offset: number; x0: number; moved: boolean; h: { t: number; v: number }[]; px: { t: number; x: number }[] } | null>(null);
  const shownHour = useRef<number | null>(null);

  // size: whole cells of ~3 CSS px (whole device pixels), as many as fit
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
      const cell = Math.max(1, Math.round(3 * dpr)) / dpr;
      const W = Math.max(60, Math.floor(el.clientWidth / cell));
      setSize((p) => (p && p.W === W && p.cell === cell ? p : { W, cell }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // the minute clock
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);

  const city: City | null = useMemo(() => (size ? buildCity(size.W, H) : null), [size]);

  const day = useMemo(() => {
    if (now == null || !city) return null;
    const ref = new Date(now);
    const W = city.W;
    const yOf = (alt: number) =>
      alt >= 0 ? city.hz - (alt / MAX_ALT) * (city.hz - 4) : city.hz + (Math.min(18, -alt) / 18) * (H - 3 - city.hz);
    const curve: { x: number; y: number; up: boolean }[] = [];
    for (let k = 0; k <= 24 * 6; k++) {
      const hour = k / 6;
      const alt = sunAt(atLocalHour(hour, ref)).elevation;
      curve.push({ x: (hour / 24) * W, y: yOf(alt), up: alt >= 0 });
    }
    const d = sunDay(ref);
    const detents: Detent[] = [
      { mode: "auto", hour: localHour(ref) },
      ...PHASES.map((p) => ({ mode: p as SkyMode, hour: localHour(new Date(pinnedMs(p, ref))) })),
    ];
    return { ref, curve, d, detents, yOf, moon: moonCells(moonPhase(ref)) };
  }, [now, city]);

  const restHour = day ? (mode === "auto" ? day.detents[0].hour : day.detents.find((x) => x.mode === mode)!.hour) : null;
  const hour = hold ?? restHour;

  // paint the little city for the sun's hour (cheap: ~4k cells)
  useEffect(() => {
    if (!city || !size || hour == null || !day) return;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    if (cv.width !== city.W || cv.height !== H) {
      cv.width = city.W;
      cv.height = H;
    }
    const img = new ImageData(city.W, H);
    const ms = atLocalHour(hour, day.ref).getTime();
    relight(city, { ms, lamps: lampsAt(ms, city), bodies: false }, new Uint32Array(img.data.buffer));
    ctx.putImageData(img, 0, 0);
  }, [city, size, hour, day]);

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** send the sun along the curve to `to`, then land on `land` (or just rest) */
  const fly = (from: number, to: number, velocity: number, thrown: boolean, land: SkyMode | null) => {
    flight.current?.stop();
    const done = () => {
      flight.current = null;
      // it rests where it landed: the mode change must not send it again
      shownHour.current = to;
      if (land) onPick(land);
      setHold(null);
    };
    if (reduced() || Math.abs(to - from) < 0.01) {
      setHold(to);
      done();
      return;
    }
    flight.current = animate(from, to, {
      ...(thrown ? springFrom(0.4, 0.18) : spring.default),
      velocity,
      restDelta: 0.002,
      onUpdate: (v) => setHold(v),
      onComplete: done,
    });
  };

  // a chip changed the mode: the sun travels there instead of jumping
  useEffect(() => {
    if (restHour == null) return;
    const prev = shownHour.current;
    shownHour.current = restHour;
    if (prev == null || g.current || flight.current || Math.abs(prev - restHour) < 0.05) return;
    fly(prev, restHour, 0, false, null);
    // fly is stable enough for this: it only reads refs and the latest onPick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restHour]);

  if (!size || !city || !day || hour == null) {
    return <div ref={wrap} className="os-menubar-skyart" aria-hidden />;
  }

  const W = city.W;
  const c = size.cell;
  const xOf = (h: number) => (h / 24) * W;
  const sunAlt = sunAt(atLocalHour(hour, day.ref)).elevation;
  const sx = xOf(hour);
  const sy = day.yOf(sunAlt);
  const sunUp = Math.min(1, Math.max(0, (sunAlt + 3) / 4));
  const phase = phaseOf(sunAt(atLocalHour(hour, day.ref)));
  const ghost = { x: Math.round(xOf(day.detents[0].hour)), y: Math.round(day.yOf(sunAt(day.ref).elevation)) };
  const hourAt = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return ((clientX - r.left) / (W * c)) * 24;
  };
  const nearest = (h: number) => day.detents.reduce((a, b) => (Math.abs(b.hour - h) < Math.abs(a.hour - h) ? b : a));

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    flight.current?.stop();
    flight.current = null;
    const h0 = hold ?? hour;
    g.current = { pid: e.pointerId, offset: h0 - hourAt(e.clientX), x0: e.clientX, moved: false, h: [], px: [] };
    setGrabbed(true);
    setHold(h0);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    d.moved = true;
    let h = hourAt(e.clientX) + d.offset;
    // resist past midnight on either side
    if (h < 0) h = -Math.min(0.6, -h * 0.35);
    if (h > 24) h = 24 + Math.min(0.6, (h - 24) * 0.35);
    d.h.push({ t: e.timeStamp, v: h });
    d.px.push({ t: e.timeStamp, x: e.clientX });
    while (d.h.length > 2 && e.timeStamp - d.h[0].t > 100) d.h.shift();
    while (d.px.length > 2 && e.timeStamp - d.px[0].t > 100) d.px.shift();
    setHold(h);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    setGrabbed(false);
    const from = hold ?? hour;
    let v = 0;
    let pxv = 0;
    if (d.h.length > 1 && e.timeStamp - d.h[d.h.length - 1].t < 60) {
      const a = d.h[0];
      const b = d.h[d.h.length - 1];
      v = ((b.v - a.v) / Math.max(8, b.t - a.t)) * 1000;
      pxv = ((d.px[d.px.length - 1].x - d.px[0].x) / Math.max(8, b.t - a.t)) * 1000;
    }
    const thrown = Math.abs(pxv) > FLING;
    const target = nearest(reduced() ? from : from + projectFling(v));
    fly(from, target.hour, v, thrown, target.mode);
  };
  // a tap on the curve: the sun goes to the nearest detent from there
  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || g.current) return;
    const target = nearest(hourAt(e.clientX));
    fly(hold ?? hour, target.hour, 0, false, target.mode);
  };

  const fmt = (h: number | null) => (h == null ? "" : fmtHour(h));
  const riseX = day.d.sunrise != null ? xOf(day.d.sunrise) : null;
  const setX = day.d.sunset != null ? xOf(day.d.sunset) : null;

  return (
    <div ref={wrap} className="os-menubar-skyart" data-held={grabbed ? "" : undefined} aria-hidden onPointerDown={onTap}>
      <canvas ref={canvas} className="os-menubar-skyart-canvas" style={{ width: W * c, height: H * c }} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W * c}
        height={H * c}
        shapeRendering="crispEdges"
        className="os-menubar-skyart-svg"
      >
        {/* today's path: dotted, faint where it runs under the city */}
        <g className="os-menubar-skyart-curve">
          {day.curve.map((p, i) =>
            i % 2 ? null : (
              <rect key={i} x={Math.round(p.x)} y={Math.round(p.y)} width={1} height={1} opacity={p.up ? 0.55 : 0.22} />
            )
          )}
        </g>
        {/* the hours the wallpaper shows for pinned phases */}
        {day.detents.slice(1).map((d) => {
          const alt = sunAt(atLocalHour(d.hour, day.ref)).elevation;
          return <rect key={d.mode} x={Math.round(xOf(d.hour))} y={Math.round(day.yOf(alt)) - 1} width={1} height={3} className="os-menubar-skyart-notch" />;
        })}
        {/* where the sun really is: Live */}
        <g className="os-menubar-skyart-ghost" transform={`translate(${ghost.x} ${ghost.y})`}>
          {RING_CELLS.map(([x, y]) => (
            <rect key={`g${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
          ))}
        </g>
        {/* the sun, or below the skyline the moon in its real phase */}
        <g transform={`translate(${Math.round(sx)} ${Math.round(sy)})`}>
          <g opacity={sunUp} className="os-menubar-skyart-sun" data-phase={phase}>
            <g opacity={grabbed ? 0.7 : 0.4}>
              {HALO_CELLS.map(([x, y]) => (
                <rect key={`h${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
              ))}
            </g>
            {grabbed &&
              cellsOf(RING.map((r) => `.${r}.`), -4, -4)
                .filter(([x, y]) => Math.abs(x) === 4 || Math.abs(y) === 4)
                .map(([x, y]) => <rect key={`r${x}-${y}`} x={x} y={y} width={1.02} height={1.02} className="os-menubar-skyart-press" />)}
            {SUN_CELLS.map(([x, y]) => (
              <rect key={`s${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
            ))}
          </g>
          <g opacity={1 - sunUp}>
            {day.moon.dark.map(([x, y]) => (
              <rect key={`md${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="#2a312d" />
            ))}
            {day.moon.lit.map(([x, y]) => (
              <rect key={`ml${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="#ebe9e1" />
            ))}
          </g>
        </g>
      </svg>
      {riseX != null && (
        <span className="os-menubar-skyart-time" style={{ left: riseX * c, top: (city.hz - 1) * c }}>
          {fmt(day.d.sunrise)}
        </span>
      )}
      {setX != null && (
        <span className="os-menubar-skyart-time" style={{ left: setX * c, top: (city.hz - 1) * c }}>
          {fmt(day.d.sunset)}
        </span>
      )}
      {(grabbed || hold != null) && (
        <span className="os-menubar-skyart-readout tabular">
          {fmt(((hour % 24) + 24) % 24)} {labels[phase]}
        </span>
      )}
      <div
        className="os-menubar-skyart-hit"
        style={{ transform: `translate3d(${sx * c - 22}px, ${sy * c - 22}px, 0)` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDown(e);
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
