"use client";

import { useRef } from "react";
import { animate, useMotionValue, useSpring } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";

/**
 * The alert's physics. A modal alert is tethered to the middle of the
 * screen: grab it anywhere that isn't a control and it lifts on
 * pointer-down, then follows the hand 1:1 from the grab offset (free
 * inside the desktop, rubber-banded past the menu bar, the Dock and the
 * screen edges), leaning a little into the direction it's dragged. Let go
 * and it springs home carrying the release velocity (a bounce only after
 * a real fling). Thrown hard down into the Dock, it flies into the
 * Desktop icon and `onThrow` takes you there, like any emOS window.
 * Interruptible: grabbing mid-flight continues from where it is.
 */

type Sample = { t: number; x: number; y: number };
type Grab = {
  pid: number;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  moved: boolean;
  samples: Sample[];
  /** free travel, in offset space */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** the alert's centre at rest, viewport px */
  cx: number;
  cy: number;
};

/** Drags never start on something the user meant to press or select. */
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[data-no-drag]';

/** px/s from the last ~80ms of pointer history; 0 once the hand stopped. */
function releaseVelocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 60) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 };
}

function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));

export function useTether({
  surfaceRef,
  stageRef,
  reduced,
  target,
  onThrow,
}: {
  /** the alert */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** the page stage: its padding is the desktop's safe area */
  stageRef: React.RefObject<HTMLElement | null>;
  reduced: boolean;
  /** where a throw lands (the Desktop's Dock icon), viewport px */
  target: () => { x: number; y: number };
  onThrow: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  /** 0 at rest, 1 held: drives the deeper shadow */
  const lift = useMotionValue(0);
  const tiltRaw = useMotionValue(0);
  const rotate = useSpring(tiltRaw, { stiffness: 260, damping: 26, mass: 0.6 });
  const grab = useRef<Grab | null>(null);
  const gone = useRef(false);

  const settle = (vx: number, vy: number) => {
    tiltRaw.set(0);
    if (reduced) {
      x.jump(0);
      y.jump(0);
      scale.jump(1);
      lift.jump(0);
      rotate.jump(0);
      return;
    }
    const t = Math.hypot(vx, vy) > 900 ? spring.flick : spring.default;
    animate(x, 0, { ...t, velocity: vx });
    animate(y, 0, { ...t, velocity: vy });
    animate(scale, 1, spring.default);
    animate(lift, 0, spring.default);
  };

  const fly = (g: Grab, vx: number, vy: number) => {
    gone.current = true;
    if (reduced) {
      onThrow();
      return;
    }
    const to = target();
    const t = { type: "spring", visualDuration: 0.42, bounce: 0 } as const;
    tiltRaw.set(0);
    animate(x, to.x - g.cx, { ...t, velocity: vx });
    animate(y, to.y - g.cy, { ...t, velocity: vy });
    animate(scale, 0.1, t);
    // fade only at the very end: opacity on the glass's ancestor blanks it
    animate(opacity, 0, { duration: 0.18, delay: 0.18, ease: [0.4, 0, 1, 1] });
    window.setTimeout(onThrow, 220);
  };

  const end = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    grab.current = null;
    const el = surfaceRef.current;
    if (el) {
      delete el.dataset.held;
      delete el.dataset.dragging;
    }
    if (!g.moved) {
      settle(0, 0);
      return;
    }
    const { vx, vy } = cancelled ? { vx: 0, vy: 0 } : releaseVelocity(g.samples, e.timeStamp);
    // thrown down into the Dock: mostly downward, and projected to land
    // at least as low as the Dock's icons
    const projected = g.cy + y.get() + project(vy);
    if (!cancelled && vy > 650 && Math.abs(vx) < vy * 1.4 && y.get() > 16 && projected > target().y - 40) {
      fly(g, vx, vy);
      return;
    }
    settle(vx, vy);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (gone.current || grab.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    const el = surfaceRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection
    x.stop();
    y.stop();
    scale.stop();
    lift.stop();
    // the alert's rest box (its layout box: transforms don't move offsetLeft/Top)
    const r = el.getBoundingClientRect();
    const restL = r.left + r.width / 2 - x.get() - el.offsetWidth / 2;
    const restT = r.top + r.height / 2 - y.get() - el.offsetHeight / 2;
    const restR = restL + el.offsetWidth;
    const restB = restT + el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cs = getComputedStyle(stageRef.current ?? document.body);
    const top = parseFloat(cs.paddingTop) || 0;
    const bottom = parseFloat(cs.paddingBottom) || 0;
    const m = 8;
    grab.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      y0: y.get(),
      moved: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      minX: Math.min(0, m - restL),
      maxX: Math.max(0, vw - m - restR),
      minY: Math.min(0, top * 0.6 - restT),
      maxY: Math.max(0, vh - bottom * 0.6 - restB),
      cx: (restL + restR) / 2,
      cy: (restT + restB) / 2,
    };
    el.dataset.held = "";
    if (!reduced) {
      animate(scale, 1.02, spring.snappy);
      animate(lift, 1, spring.snappy);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      if (surfaceRef.current) surfaceRef.current.dataset.dragging = "";
    }
    const prev = g.samples[g.samples.length - 1];
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 120) g.samples.shift();
    x.set(band(g.x0 + dx, g.minX, g.maxX, window.innerWidth));
    y.set(band(g.y0 + dy, g.minY, g.maxY, window.innerHeight));
    if (!reduced && prev) {
      // lean into the drag, like a card held at its edge
      const vx = ((e.clientX - prev.x) / Math.max(8, e.timeStamp - prev.t)) * 1000;
      tiltRaw.set(clampAbs(vx / 340, 3.2));
    }
  };

  return {
    style: { x, y, scale, rotate, opacity },
    x,
    y,
    lift,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, false),
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, true),
    },
  };
}
