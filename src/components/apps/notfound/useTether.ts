"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useSpring, useTransform } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { bounce, visibleIcon } from "@/components/os/dock/launch";

/**
 * The alert's physics. A modal alert is tethered to the middle of the
 * screen: grab it anywhere that isn't a control and it lifts on
 * pointer-down, then follows the hand 1:1 from the grab offset (free
 * inside the desktop, rubber-banded past the menu bar, the Dock and the
 * screen edges), leaning a little into the direction it's dragged. Let go
 * and it springs home carrying the release velocity (a bounce only after
 * a real fling). Thrown hard down into the Dock, it flies into the
 * Desktop icon and `onThrow` takes you there, like any emOS window; the
 * Desktop buttons send it down the same path (`dismiss`). It navigates
 * when it lands (not on a timer), fading only in the last stretch of the
 * flight, and the Dock icon nods as it catches it. Interruptible:
 * grabbing mid-flight continues from exactly where it is, even caught
 * while stretched past an edge.
 *
 * On touch, when the page is taller than the screen (short phones), a
 * vertical swipe on the alert scrolls the page: the alert only claims a
 * gesture that starts sideways.
 */

/*
 * Physical springs (stiffness/damping), not visualDuration/bounce: motion
 * drops the initial velocity of time-defined springs, so a velocity
 * handoff needs these. They're the exact equivalents of the house presets
 * (default 0.35s critically damped, flick 0.4s bounce 0.18, fly 0.42s).
 */
const SETTLE = { type: "spring", stiffness: 223.8, damping: 29.92, mass: 1 } as const;
const FLICK = { type: "spring", stiffness: 171.35, damping: 21.47, mass: 1 } as const;
const FLY = { type: "spring", stiffness: 155.4, damping: 24.93, mass: 1 } as const;

/** a hard sideways fling must not carry the alert off-screen */
const MAX_SETTLE_V = 2400;
const MAX_FLY_V = 4000;
/** px/s of release speed above which the return may bounce */
const FLICK_SPEED = 900;
/** the flight's scale where the alert counts as caught by the Dock (it
    flies to 0.1); it's faded out by then, so the page can change */
const LANDED = 0.14;
/** …and where it starts to fade (a glass's ancestor at opacity < 1 stops
    refracting, so this stays late, when it's small and fast) */
const FADE_FROM = 0.4;

type Sample = { t: number; x: number; y: number };
type Grab = {
  pid: number;
  /** a touch on a page that scrolls: vertical swipes belong to the page */
  yieldY: boolean;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  moved: boolean;
  /** pointer history (intent: is this a throw into the Dock?) */
  hand: Sample[];
  /** the alert's own offsets (what the spring inherits: rubber band included) */
  body: Sample[];
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

/** px/s from the last ~80ms of history; 0 once the hand stopped. */
function velocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 80) return { vx: 0, vy: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return { vx: ((last.x - first.x) / dt) * 1000, vy: ((last.y - first.y) / dt) * 1000 };
}

function push(samples: Sample[], s: Sample) {
  samples.push(s);
  while (samples.length > 2 && s.t - samples[0].t > 120) samples.shift();
}

/** how far past the desktop's edges the tether lets the alert stretch (px, asymptotic) */
const STRETCH = 180;

function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

/** band()'s inverse: the hand offset that stretches the alert to `v`. A
    grab while it's stretched starts from there, so the band isn't applied
    twice and the alert stays under the finger. */
function unband(v: number, min: number, max: number, dim: number) {
  const inv = (r: number) => {
    const c = Math.min(r, dim - 1);
    return (c * dim) / (0.55 * (dim - c));
  };
  if (v > max) return max + inv(v - max);
  if (v < min) return min - inv(min - v);
  return v;
}

const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** The Desktop's Dock icon (or tab) nods as it catches the alert. */
function catchInDock() {
  const icon = visibleIcon("home")?.querySelector("[data-dock-bounce]");
  bounce(icon, window.matchMedia("(max-width: 767px)").matches ? 7 : 12);
}

export function useTether({
  surfaceRef,
  stageRef,
  reduced,
  target,
  onLeave,
  onThrow,
}: {
  /** the alert */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** the page stage: its padding is the desktop's safe area */
  stageRef: React.RefObject<HTMLElement | null>;
  reduced: boolean;
  /** where a throw lands (the Desktop's Dock icon), viewport px */
  target: () => { x: number; y: number };
  /** the alert starts flying into the Dock (sound goes here) */
  onLeave?: () => void;
  /** it landed in the Dock (or reduced motion skipped the flight): navigate */
  onThrow: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  // the fade is tied to the flight, not a clock: it's gone as it lands
  const opacity = useTransform(scale, [LANDED, FADE_FROM], [0, 1], { clamp: true });
  /** 0 at rest, 1 held: drives the deeper shadow */
  const lift = useMotionValue(0);
  const tiltRaw = useMotionValue(0);
  const rotate = useSpring(tiltRaw, { stiffness: 260, damping: 26, mass: 0.6 });
  const grab = useRef<Grab | null>(null);
  const gone = useRef(false);

  // touch: does the page scroll? (then vertical swipes belong to it; CSS
  // reads data-scrolls to hand the browser `touch-action: pan-y`)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const se = document.scrollingElement ?? document.documentElement;
        stage.toggleAttribute("data-scrolls", se.scrollHeight > window.innerHeight + 1);
      });
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(stage);
    window.addEventListener("resize", check);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [stageRef]);

  /** the alert's rest box (its layout box: transforms don't move offsetWidth/Height) */
  const restBox = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const l = r.left + r.width / 2 - x.get() - el.offsetWidth / 2;
    const t = r.top + r.height / 2 - y.get() - el.offsetHeight / 2;
    return { l, t, r: l + el.offsetWidth, b: t + el.offsetHeight };
  };

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
    const t = Math.hypot(vx, vy) > FLICK_SPEED ? FLICK : SETTLE;
    animate(x, 0, { ...t, velocity: clampAbs(vx, MAX_SETTLE_V) });
    animate(y, 0, { ...t, velocity: clampAbs(vy, MAX_SETTLE_V) });
    animate(scale, 1, spring.default);
    animate(lift, 0, spring.default);
  };

  /** into the Desktop's Dock icon; `onThrow` once it's there */
  const fly = (cx: number, cy: number, vx: number, vy: number) => {
    gone.current = true;
    onLeave?.();
    if (reduced) {
      onThrow();
      return;
    }
    const to = target();
    tiltRaw.set(0);
    animate(x, to.x - cx, { ...FLY, velocity: clampAbs(vx, MAX_FLY_V) });
    animate(y, to.y - cy, { ...FLY, velocity: clampAbs(vy, MAX_FLY_V) });
    animate(lift, 0, spring.snappy);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      stop();
      catchInDock();
      onThrow();
    };
    const stop = scale.on("change", (s) => {
      if (s <= LANDED) land();
    });
    animate(scale, 0.1, FLY).then(land);
  };

  /** The Desktop buttons: the alert leaves the way a throw does. */
  const dismiss = () => {
    const el = surfaceRef.current;
    if (gone.current) return;
    if (!el) {
      onLeave?.();
      onThrow();
      return;
    }
    grab.current = null;
    const b = restBox(el);
    fly((b.l + b.r) / 2, (b.t + b.b) / 2, 0, 0);
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
    if (!g.moved || cancelled) {
      settle(0, 0);
      return;
    }
    const hand = velocity(g.hand, e.timeStamp);
    const body = velocity(g.body, e.timeStamp);
    // thrown down into the Dock: mostly downward, and projected to land
    // at least as low as the Dock's icons
    const projected = g.cy + y.get() + project(hand.vy);
    if (hand.vy > 650 && Math.abs(hand.vx) < hand.vy * 1.4 && y.get() > 16 && projected > target().y - 40) {
      fly(g.cx, g.cy, body.vx, Math.max(body.vy, hand.vy * 0.5));
      return;
    }
    settle(body.vx, body.vy);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (gone.current || grab.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    const el = surfaceRef.current;
    if (!el) return;
    const touch = e.pointerType !== "mouse";
    const scrolls = touch && stageRef.current?.hasAttribute("data-scrolls");
    // a touch on a scrolling page is only ours once it turns out sideways
    if (!scrolls) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    if (!touch) e.preventDefault(); // no text selection
    // grabbing the alert gives it focus, like clicking a window (its keys
    // answer zsh while it has it)
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    x.stop();
    y.stop();
    scale.stop();
    lift.stop();
    const b = restBox(el);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cs = getComputedStyle(stageRef.current ?? document.body);
    const top = parseFloat(cs.paddingTop) || 0;
    const bottom = parseFloat(cs.paddingBottom) || 0;
    const m = 8;
    const minX = Math.min(0, m - b.l);
    const maxX = Math.max(0, vw - m - b.r);
    const minY = Math.min(0, top * 0.6 - b.t);
    const maxY = Math.max(0, vh - bottom * 0.6 - b.b);
    grab.current = {
      pid: e.pointerId,
      yieldY: !!scrolls,
      sx: e.clientX,
      sy: e.clientY,
      // in hand space: caught while stretched, the band isn't applied twice
      x0: unband(x.get(), minX, maxX, STRETCH),
      y0: unband(y.get(), minY, maxY, STRETCH),
      moved: false,
      hand: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      body: [{ t: e.timeStamp, x: x.get(), y: y.get() }],
      minX,
      maxX,
      minY,
      maxY,
      cx: (b.l + b.r) / 2,
      cy: (b.t + b.b) / 2,
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
      if (g.yieldY) {
        // vertical first: the browser is scrolling; let it have the gesture
        if (Math.abs(dy) > 6 && Math.abs(dy) >= Math.abs(dx)) {
          end(e, true);
          return;
        }
        if (Math.abs(dx) < 8) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      } else if (Math.hypot(dx, dy) < 3) return;
      g.moved = true;
      if (surfaceRef.current) surfaceRef.current.dataset.dragging = "";
    }
    const prev = g.hand[g.hand.length - 1];
    push(g.hand, { t: e.timeStamp, x: e.clientX, y: e.clientY });
    const nx = band(g.x0 + dx, g.minX, g.maxX, STRETCH);
    const ny = band(g.y0 + dy, g.minY, g.maxY, STRETCH);
    x.set(nx);
    y.set(ny);
    push(g.body, { t: e.timeStamp, x: nx, y: ny });
    if (!reduced && prev) {
      // lean into the drag, like a card held at its edge
      const vx = ((e.clientX - prev.x) / Math.max(8, e.timeStamp - prev.t)) * 1000;
      tiltRaw.set(clampAbs(vx / 340, 3.2));
    }
  };

  /** Once, unprompted: a small tug, so the sheet (and its loose pixels)
      shows it's a thing you can move. Never under reduced motion, never
      while held or gone. */
  const nudge = () => {
    if (reduced || grab.current || gone.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate(x, 0, { ...FLICK, velocity: 190 });
    animate(y, 0, { ...FLICK, velocity: -110 });
  };

  return {
    style: { x, y, scale, rotate, opacity },
    x,
    y,
    lift,
    dismiss,
    nudge,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => end(e, false),
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => end(e, true),
    },
  };
}
