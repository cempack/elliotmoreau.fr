"use client";

import { useRef } from "react";
import { animate, useMotionValue } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";

type Sample = { t: number; x: number; y: number };
type Grab = {
  pid: number;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  scroll0: number;
  moved: boolean;
  samples: Sample[];
  /** free travel before the rubber band, per side */
  playX: number;
  playTop: number;
};

/** Drags never start on something the user meant to click or type into. */
const INTERACTIVE =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[contenteditable="true"],[data-no-drag]';

/** px/s from the last ~80ms of pointer history; 0 when the hand had stopped. */
export function releaseVelocity(samples: Sample[], now: number) {
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

/** Progressive resistance outside [min, max]. */
export function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

/** Pulling toward the Dock shrinks the window a little, like an app card. */
const scaleFor = (y: number, vh: number) => (y > 0 ? 1 - 0.18 * Math.min(1, y / (vh * 0.75)) : 1);

/**
 * Title-bar physics for the app window.
 * - Responds on pointer-down (the window lifts), then tracks 1:1 from the
 *   grab offset: free inside its margins, rubber-banded past them;
 *   downward is the close direction and stays 1:1 (it shrinks a little,
 *   scaling about the grab point so the hand never slips).
 * - On release the velocity is projected (project()); thrown past the
 *   threshold it flies into its Dock icon and `onClose` navigates home.
 *   Otherwise it springs home carrying the release velocity, with a
 *   little bounce only after a real fling.
 * - Interruptible: grabbing mid-spring continues from where it is.
 * Returns motion values to bind on the window (`style`) and the handlers
 * for the title bar.
 */
export function useWindowDrag({
  winRef,
  barRef,
  reduced,
  onGrab,
  onThrow,
  onClose,
  target,
}: {
  winRef: React.RefObject<HTMLElement | null>;
  barRef: React.RefObject<HTMLElement | null>;
  reduced: boolean;
  onGrab: () => void;
  /** called once the gesture commits to closing (before the flight) */
  onThrow: () => void;
  onClose: () => void;
  /** where the window flies to (the app's Dock icon), viewport px */
  target: () => { x: number; y: number };
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const originX = useMotionValue(0.5);
  const originY = useMotionValue(0);
  const grab = useRef<Grab | null>(null);
  const closing = useRef(false);

  const atRest = () => Math.abs(x.get()) < 0.05 && Math.abs(y.get()) < 0.05 && Math.abs(scale.get() - 1) < 0.0005;

  const settle = (vx: number, vy: number) => {
    if (reduced) {
      x.jump(0);
      y.jump(0);
      scale.jump(1);
      return;
    }
    const t = Math.hypot(vx, vy) > 900 ? spring.flick : spring.default;
    animate(x, 0, { ...t, velocity: vx });
    animate(y, 0, { ...t, velocity: vy });
    animate(scale, 1, spring.default);
  };

  const fly = (px: number, py: number, vx: number, vy: number) => {
    closing.current = true;
    onThrow();
    if (reduced) {
      onClose();
      return;
    }
    // the grab point is the transform origin: steer it into the icon
    const to = target();
    const t = { type: "spring", visualDuration: 0.42, bounce: 0 } as const;
    animate(x, x.get() + (to.x - px), { ...t, velocity: vx });
    animate(y, y.get() + (to.y - py), { ...t, velocity: vy });
    animate(scale, 0.12, t);
    // fade only at the very end: opacity on an ancestor blanks the glass
    animate(opacity, 0, { duration: 0.2, delay: 0.16, ease: [0.4, 0, 1, 1] });
    // head home while it lands, not after: the Desktop is (pre)fetched and
    // rendering by the time the window reaches its icon
    window.setTimeout(onClose, 200);
  };

  const end = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    grab.current = null;
    const win = winRef.current;
    if (win) {
      delete win.dataset.grabbed;
      delete win.dataset.dragging;
    }
    if (!g.moved) return;
    const { vx, vy } = cancelled ? { vx: 0, vy: 0 } : releaseVelocity(g.samples, e.timeStamp);
    const vh = window.innerHeight;
    const projected = y.get() + project(vy);
    const threshold = Math.min(vh * 0.3, 280);
    if (!cancelled && projected > threshold && vy > -120 && y.get() > 24) {
      fly(e.clientX, e.clientY, vx, vy);
      return;
    }
    settle(vx, vy);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (closing.current || grab.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    const win = winRef.current;
    if (!win) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection
    x.stop();
    y.stop();
    scale.stop();
    const wr = win.getBoundingClientRect();
    if (atRest() && wr.width > 0 && wr.height > 0) {
      originX.jump((e.clientX - wr.left) / wr.width);
      originY.jump((e.clientY - wr.top) / wr.height);
    }
    const vw = window.innerWidth;
    const bar = barRef.current;
    const stickTop = bar ? parseFloat(getComputedStyle(bar).top) || 0 : 0;
    const restTop = wr.top - y.get();
    grab.current = {
      pid: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      y0: y.get(),
      scroll0: window.scrollY,
      moved: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      playX: Math.max(0, Math.min(wr.left, vw - wr.right) - 8),
      playTop: Math.max(0, restTop - stickTop - 6),
    };
    win.dataset.grabbed = "";
    onGrab();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      if (winRef.current) winRef.current.dataset.dragging = "";
    }
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 120) g.samples.shift();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // the page may scroll under a held window: stay under the hand
    const rawY = g.y0 + dy + (window.scrollY - g.scroll0);
    const ny = rawY < -g.playTop ? -g.playTop - rubberband(-g.playTop - rawY, vh) : rawY;
    x.set(band(g.x0 + dx, -g.playX, g.playX, vw));
    y.set(ny);
    scale.set(scaleFor(ny, vh));
  };

  return {
    style: { x, y, scale, opacity, originX, originY },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, false),
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, true),
      onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => end(e, true),
    },
  };
}
