"use client";

import { useEffect, useRef } from "react";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { clamp, project, rubberband, spring } from "@/lib/motion";
import { useLiquidGlass } from "./LiquidGlass";
import { useMedia } from "./env";
import { useGlassCopy } from "./strings";

const SIZE = 156;
const MARGIN = 12;

type Sample = { x: number; y: number; t: number };

function velocity(h: Sample[]) {
  if (h.length < 2) return { vx: 0, vy: 0 };
  const last = h[h.length - 1];
  let first = h[0];
  for (let i = h.length - 2; i >= 0; i--) {
    first = h[i];
    if (last.t - h[i].t > 80) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/**
 * A loupe lying on the page. It magnifies whatever is under it (in
 * Chromium it truly refracts; elsewhere it's a clear, brightened disc).
 * Grab it anywhere: it tracks 1:1 from the grab point, resists past the
 * viewport edges, and a flick throws it, projecting where it would come to
 * rest and handing the release velocity to the spring that lands it there.
 * Desktop and fine pointers only.
 */
export function Lens() {
  const enabled = useMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
  const opaque = useMedia("(prefers-reduced-transparency: reduce)");
  if (!enabled || opaque) return null;
  return <LensBody />;
}

// over the moon (the sky paints it at 80% / 17%); client-only, so window is safe
const startX = () => Math.round(window.innerWidth * 0.8 - SIZE / 2 - 36);
const startY = () => Math.round(window.innerHeight * 0.17 - SIZE / 2 + 54);

function LensBody() {
  const c = useGlassCopy();
  const reduced = useReducedMotion();
  // start where it lies, from the first render
  const x = useMotionValue(startX());
  const y = useMotionValue(startY());
  const lift = useMotionValue(0);
  const scale = useTransform(lift, [0, 1], [1, 1.06]);
  const shadow = useTransform(
    lift,
    [0, 1],
    [
      "0 18px 40px -14px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.25)",
      "0 34px 70px -18px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.3)",
    ]
  );
  const { ref, layer } = useLiquidGlass<HTMLDivElement>({
    mode: "lens",
    radius: SIZE / 2,
    bevel: SIZE / 2,
    strength: 74,
    chroma: 0.045,
  });
  const drag = useRef<{ id: number; ox: number; oy: number; hist: Sample[] } | null>(null);

  // keep it inside the page width when the window changes
  useEffect(() => {
    const place = () => x.set(clamp(x.get(), MARGIN, window.innerWidth - SIZE - MARGIN));
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [x]);

  /**
   * The loupe lies on the page (it scrolls away with the hero instead of
   * hovering over everything), but its soft walls are the visible viewport:
   * bounds are the viewport expressed in page coordinates.
   */
  const bounds = () => {
    const host = ref.current?.offsetParent as HTMLElement | null;
    const top = host ? host.getBoundingClientRect().top : 0;
    return {
      minX: MARGIN,
      minY: -top + MARGIN,
      maxX: window.innerWidth - SIZE - MARGIN,
      maxY: -top + window.innerHeight - SIZE - MARGIN,
    };
  };

  const band = (v: number, min: number, max: number, dim: number) => {
    if (v < min) return min - rubberband(min - v, dim);
    if (v > max) return max + rubberband(v - max, dim);
    return v;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    x.stop();
    y.stop();
    // respect where it was grabbed: no snapping to the center
    drag.current = {
      id: e.pointerId,
      ox: e.clientX - x.get(),
      oy: e.clientY - y.get(),
      hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }],
    };
    animate(lift, 1, spring.snappy);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const b = bounds();
    x.set(band(e.clientX - d.ox, b.minX, b.maxX, window.innerWidth * 0.5));
    y.set(band(e.clientY - d.oy, b.minY, b.maxY, window.innerHeight * 0.5));
    d.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 14) d.hist.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    animate(lift, 0, spring.default);
    const { vx, vy } = velocity(d.hist);
    const b = bounds();
    // a loupe slides less far than a page scrolls: 0.995 deceleration
    const tx = clamp(x.get() + project(vx, 0.995), b.minX, b.maxX);
    const ty = clamp(y.get() + project(vy, 0.995), b.minY, b.maxY);
    const thrown = Math.hypot(vx, vy) > 400 && !reduced;
    const t = thrown ? spring.flick : spring.default;
    animate(x, tx, { ...t, velocity: vx });
    animate(y, ty, { ...t, velocity: vy });
  };

  return (
    <m.div
      ref={ref}
      aria-hidden
      className="lg g-lens"
      data-cursor={c.drag}
      style={{ x, y, scale, boxShadow: shadow, width: SIZE, height: SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {layer}
      <span className="g-lens-glint" />
    </m.div>
  );
}
