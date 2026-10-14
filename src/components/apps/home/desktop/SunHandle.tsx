"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { atLocalHour, phaseOf, sunAt, sunDay, type SkyPhase } from "@/lib/sun";
import { useSound } from "@/lib/sound";
import { skySound } from "@/components/os/sky";
import { project, sunScrub, sunSpot, type SunView } from "@/components/os/wallpaper/sunClock";
import { grabSun, holdSun, releaseSun } from "@/components/os/wallpaper/hold";
import { FLING, pushSample, releaseVelocity, type Sample } from "./physics";

/**
 * The wallpaper's sun as a handle (fine pointers; on touch, Control
 * Center's sky holds it). A 44px hit area over wherever the wallpaper
 * drew the sun: press it and today's real path appears as a dotted track
 * with a notch at now, drag and the sun follows the arc 1:1 from where you
 * took it, the city relighting under it and the clock widget reading the
 * hour held; past first light or nightfall it resists, and on release it
 * springs back to now. Not focusable: Control Center's sky chips are the
 * accessible control for the sky.
 */

const STEP = 3 * 60_000;

type Pt = { ms: number; x: number; y: number };

/** today's path in CSS px, first light to nightfall */
function pathFor(view: SunView, ref: Date) {
  const d = sunDay(ref);
  const from = atLocalHour(d.dawn ?? 6, ref).getTime();
  const to = atLocalHour(d.dusk ?? 21, ref).getTime();
  const pts: Pt[] = [];
  for (let ms = from; ms <= to; ms += STEP) {
    const s = sunAt(ms);
    const p = project(view, s.elevation, s.azimuth);
    pts.push({ ms, x: p.x * view.cell, y: p.y * view.cell });
  }
  return { pts, from, to };
}

/** the instant on the path nearest a point; past either end, extrapolated
    along the end segment so the hold can rubber-band */
function msAt(pts: Pt[], x: number, y: number) {
  let best = { d: Infinity, ms: pts[0].ms };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    let t = ((x - a.x) * vx + (y - a.y) * vy) / len2;
    const first = i === 0;
    const last = i === pts.length - 2;
    if (!(first && t < 0) && !(last && t > 1)) t = Math.max(0, Math.min(1, t));
    const px = a.x + vx * t;
    const py = a.y + vy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.d) best = { d, ms: a.ms + (b.ms - a.ms) * t };
  }
  return best.ms;
}

export function SunHandle() {
  const spot = useSyncExternalStore(sunSpot.subscribe, sunSpot.get, () => null);
  const [held, setHeld] = useState<{ view: SunView; pts: Pt[]; now: number } | null>(null);
  const g = useRef<{ pid: number; dx: number; dy: number; from: number; to: number; pts: Pt[]; ms: Sample[]; px: Sample[] } | null>(null);
  const { blip } = useSound();
  /** what the held sun is showing: its phase and its hour, so crossing either is heard */
  const heard = useRef<{ phase: SkyPhase; hour: number } | null>(null);

  const track = useMemo(() => {
    if (!held) return null;
    const { view, pts, now } = held;
    const c = view.cell;
    // a dot every quarter hour, in art pixels so it sits on the wallpaper's grid
    const dots = pts.filter((_, i) => i % 5 === 0).map((p) => ({ x: Math.round(p.x / c), y: Math.round(p.y / c) }));
    const s = sunAt(now);
    const n = project(view, s.elevation, s.azimuth);
    return { dots, now: { x: Math.round(n.x), y: Math.round(n.y) } };
  }, [held]);

  if (!spot) return null;
  const sun = sunAt(spot.ms);
  const W = spot.view.W * spot.view.cell;
  const visible = sun.elevation > -1.5 && spot.x > -22 && spot.x < W + 22;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const now = new Date();
    const { pts, from, to } = pathFor(spot.view, now);
    if (pts.length < 2) return;
    grabSun();
    heard.current = { phase: phaseOf(sunAt(now)), hour: Math.floor(now.getTime() / 3_600_000) };
    g.current = { pid: e.pointerId, dx: e.clientX - spot.x, dy: e.clientY - spot.y, from, to, pts, ms: [], px: [] };
    setHeld({ view: spot.view, pts, now: now.getTime() });
    pushSample(g.current.px, { t: e.timeStamp, x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const ms = holdSun(msAt(d.pts, e.clientX - d.dx, e.clientY - d.dy), d.from, d.to);
    const h = heard.current;
    if (h) {
      const phase = phaseOf(sunAt(new Date(ms)));
      const hour = Math.floor(ms / 3_600_000);
      if (phase !== h.phase) blip(skySound(h.phase, phase));
      else if (hour !== h.hour) blip("hour");
      heard.current = { phase, hour };
    }
    pushSample(d.ms, { t: e.timeStamp, x: ms / 60_000, y: 0 });
    pushSample(d.px, { t: e.timeStamp, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    setHeld(null);
    const p = releaseVelocity(d.px, e.timeStamp);
    if (sunScrub.get() == null) return;
    // back to now: if the held sun was in another light, the sky turns back with it
    const was = heard.current?.phase;
    const live = phaseOf(sunAt(new Date()));
    if (was && was !== live) window.setTimeout(() => blip(skySound(was, live)), 180);
    heard.current = null;
    releaseSun(releaseVelocity(d.ms, e.timeStamp).vx, Math.hypot(p.vx, p.vy) > FLING);
  };

  const c = spot.view.cell;
  const rArt = Math.round(spot.r / c);
  return (
    <>
      {held && track && (
        <svg
          className="app-home-sun-track"
          viewBox={`0 0 ${held.view.W} ${Math.ceil(window.innerHeight / c)}`}
          width={held.view.W * c}
          height={Math.ceil(window.innerHeight / c) * c}
          shapeRendering="crispEdges"
          aria-hidden
        >
          {track.dots.map((p, i) => (
            <rect key={i} x={p.x} y={p.y} width={1} height={1} />
          ))}
          <rect x={track.now.x - 1} y={track.now.y - 1} width={3} height={3} className="app-home-sun-track-now" />
          {/* the paper ring around the sun, one art pixel */}
          {ring(Math.round(spot.x / c), Math.round(spot.y / c), rArt + 2).map(([x, y]) => (
            <rect key={`r${x}-${y}`} x={x} y={y} width={1} height={1} className="app-home-sun-track-ring" />
          ))}
        </svg>
      )}
      <div
        aria-hidden
        data-no-drag
        data-held={held ? "" : undefined}
        className="app-home-sun-handle"
        style={{ transform: `translate3d(${spot.x - 22}px, ${spot.y - 22}px, 0)`, visibility: visible || held ? undefined : "hidden" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </>
  );
}

/** cells of a pixel circle outline */
function ring(cx: number, cy: number, r: number) {
  const out: [number, number][] = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r - 0.5 && d <= r + 0.5) out.push([cx + x, cy + y]);
    }
  }
  return out;
}
