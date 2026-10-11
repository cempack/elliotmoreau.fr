"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls } from "motion/react";
import { clamp, project, rubberband, spring } from "@/lib/motion";

/**
 * App-switcher geometry, read left to right. The focused card sits on the
 * content column's left edge, under the chapter title; cards still to
 * come pile up to its right, tucked under it and shrinking into depth;
 * cards already seen leave to the left at full size. `q` is the
 * continuous focus rank (0 = first project), and a card of rank r sits at
 * d = q − r:
 *
 *   x(d) = A − f(d),  f(d) = d·R                        for d ≥ 0
 *                      f(d) = L·d − D·(1 − e^{k·d})     for d < 0
 *
 * with k = (R − L) / D so the slope is continuous through d = 0 (no kink
 * when a card slides out of the pile) and f is convex and invertible.
 * Next is to the right, like reading: drag left (or →) pulls the next
 * card off the pile.
 */
export type DeckGeo = {
  /** focused card's left edge, px from the viewport's left */
  A: number;
  /** card width */
  W: number;
  /** spacing of cards to the right (W + gap) */
  R: number;
  /** linear spread of deep pile cards, px per card */
  L: number;
  /** depth of the exponential part of the pile */
  D: number;
  k: number;
  /** viewport width (rubber-band dimension) */
  vw: number;
  /** scale lost per card of pile depth */
  shrink: number;
  /** wide enough to show names on the first pile card */
  roomy: boolean;
};

export function makeGeo(vw: number, left: number, right: number, W: number): DeckGeo {
  const A = left;
  const P = Math.max(24, right - left - W);
  const R = W + clamp(W * 0.045, 14, 30);
  const L = P * 0.075;
  const D = P - 4 * L;
  return { A, W, R, L, D, k: (R - L) / D, vw, shrink: P > 200 ? 0.045 : 0.03, roomy: P > 220 };
}

export const offsetAt = (d: number, g: DeckGeo) => (d >= 0 ? d * g.R : g.L * d - g.D * (1 - Math.exp(g.k * d)));
/** a card's left edge at depth d */
export const xAt = (d: number, g: DeckGeo) => g.A - offsetAt(d, g);
const slopeAt = (d: number, g: DeckGeo) => (d >= 0 ? g.R : g.L + g.D * g.k * Math.exp(g.k * d));

/** f⁻¹: Newton from the right of the root (f is convex for d < 0). */
function depthFor(y: number, g: DeckGeo) {
  if (y >= 0) return y / g.R;
  let d = y / g.R;
  for (let i = 0; i < 16; i++) {
    const step = (offsetAt(d, g) - y) / slopeAt(d, g);
    d = Math.min(0, d - step);
    if (Math.abs(step) < 1e-4) break;
  }
  return d;
}

type Sample = { t: number; x: number };
type Grab = {
  pid: number;
  sx: number;
  sy: number;
  /** the card under the hand: it tracks the pointer 1:1 */
  r: number;
  /** its offset from the anchor at grab time */
  y0: number;
  /** the card in focus when the hand came down */
  from: number;
  /** the press caught the deck between two cards (mid-settle) */
  caught: boolean;
  dragging: boolean;
  /** horizontal travel when the drag took over, eased back in after */
  slop: number;
  samples: Sample[];
  el: HTMLElement | null;
};

function releaseVelocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 70) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 90) break;
    first = samples[i];
  }
  const dt = Math.max(10, last.t - first.t);
  return ((last.x - first.x) / dt) * 1000;
}

/**
 * The deck's physics: 1:1 tracking from the grab offset (the card under
 * the hand stays under it, the rest follow with parallax), rubber-band
 * past both ends, momentum projected through the geometry to pick the
 * card it would come to rest on, then a spring that carries the release
 * velocity (bounce only after a real fling). Interruptible at any time.
 * Horizontal trackpad swipes scroll it 1:1 and settle on the nearest
 * card. Reduced motion: drags still track, snaps are instant.
 */
export function useDeck({ count, reduced, onSnap }: { count: number; reduced: boolean; onSnap?: (to: number) => void }) {
  const q = useMotionValue(0);
  const [index, setIndex] = useState(0);
  const [geo, setGeo] = useState<DeckGeo | null>(null);
  const geoRef = useRef<DeckGeo | null>(null);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const grab = useRef<Grab | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef(0);
  const wheel = useRef<{ raw: number; timer: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const max = Math.max(0, count - 1);
  const onSnapRef = useRef(onSnap);
  useEffect(() => {
    onSnapRef.current = onSnap;
  });

  useMotionValueEvent(q, "change", (v) => {
    const i = clamp(Math.round(v), 0, max);
    setIndex((prev) => (prev === i ? prev : i));
  });

  // geometry: the content column (ruler) and the card width (CSS) decide
  // where the focused card sits and how much room the pile gets
  useEffect(() => {
    const vp = viewportRef.current;
    const ruler = rulerRef.current;
    if (!vp || !ruler) return;
    const measure = () => {
      const card = vp.querySelector<HTMLElement>("[data-deck-card]");
      if (!card) return;
      const g = makeGeo(vp.clientWidth, ruler.offsetLeft, ruler.offsetLeft + ruler.offsetWidth, card.offsetWidth);
      geoRef.current = g;
      setGeo(g);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    ro.observe(ruler);
    return () => ro.disconnect();
  }, [count]);

  const settle = useCallback(
    (target: number, velocity = 0, flung = false) => {
      anim.current?.stop();
      const to = clamp(target, 0, max);
      if (reduced) {
        q.jump(to);
        return;
      }
      anim.current = animate(q, to, { ...(flung ? spring.flick : spring.default), velocity });
    },
    [max, q, reduced]
  );

  const go = useCallback((i: number) => settle(Math.round(i)), [settle]);

  /** raw (unclamped) focus rank → rubber-banded past both ends */
  const band = useCallback(
    (raw: number) => {
      const g = geoRef.current;
      const dim = g?.vw ?? 1000;
      const R = g?.R ?? 600;
      if (raw < 0) return -rubberband(-raw * R, dim) / R;
      if (raw > max) return max + rubberband((raw - max) * R, dim) / R;
      return raw;
    },
    [max]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || !geoRef.current || count < 2) return;
      const g = geoRef.current;
      // responds on pointer-down: whatever was moving stops under the hand
      anim.current?.stop();
      if (wheel.current) {
        window.clearTimeout(wheel.current.timer);
        wheel.current = null;
      }
      const now = q.get();
      const hit = (e.target as Element).closest<HTMLElement>("[data-deck-card]");
      const hitRank = hit ? Number(hit.dataset.deckCard) : Math.round(now);
      // deep pile cards are thin slivers: drive with the first one instead
      const r = clamp(hitRank, Math.round(now) - 1, Math.min(max, Math.round(now) + 1));
      grab.current = {
        pid: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        r,
        y0: offsetAt(now - r, g),
        from: Math.round(now),
        caught: Math.abs(now - Math.round(now)) > 0.002,
        dragging: false,
        slop: 0,
        samples: [{ t: e.timeStamp, x: e.clientX }],
        el: hit,
      };
      if (hit) hit.dataset.pressed = "";
      window.clearTimeout(clickTimer.current);
      suppressClick.current = false;
    },
    [count, max, q]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const gr = grab.current;
      const g = geoRef.current;
      if (!gr || !g || e.pointerId !== gr.pid) return;
      const dx = e.clientX - gr.sx;
      const dy = e.clientY - gr.sy;
      if (!gr.dragging) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          gr.dragging = true;
          // the first frame doesn't jump the slop; it eases back in over
          // the next 60px so the card ends up under the very point grabbed
          gr.slop = dx;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // synthetic or already-released pointer: track without capture
          }
          e.currentTarget.dataset.dragging = "";
        } else if (Math.abs(dy) > 10) {
          // the page scrolls instead; a deck caught mid-flight finishes
          if (gr.el) delete gr.el.dataset.pressed;
          grab.current = null;
          if (gr.caught) settle(Math.round(q.get()));
        }
        return;
      }
      gr.samples.push({ t: e.timeStamp, x: e.clientX });
      if (gr.samples.length > 12) gr.samples.shift();
      const move = dx - gr.slop * Math.max(0, 1 - Math.abs(dx - gr.slop) / 60);
      // x = A − f: the hand moving right pulls the card's offset down
      const raw = gr.r + depthFor(gr.y0 - move, g);
      q.set(band(raw));
    },
    [band, q, settle]
  );

  /** a drag (or a catch) is not a click: swallow the one that follows */
  const swallowClick = useCallback(() => {
    suppressClick.current = true;
    window.clearTimeout(clickTimer.current);
    // touch can deliver no click at all: never let the flag outlive the gesture
    clickTimer.current = window.setTimeout(() => (suppressClick.current = false), 400);
  }, []);

  const end = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const gr = grab.current;
      const g = geoRef.current;
      if (!gr || e.pointerId !== gr.pid) return;
      grab.current = null;
      if (gr.el) delete gr.el.dataset.pressed;
      delete e.currentTarget.dataset.dragging;
      if (!gr.dragging || !g) {
        // a press that caught the deck between cards: it settles on the
        // nearest one (as iOS does) and the tap never opens anything
        if (gr.caught) {
          swallowClick();
          settle(Math.round(q.get()));
        }
        return;
      }
      swallowClick();
      const vx = e.type === "pointercancel" ? 0 : releaseVelocity(gr.samples, e.timeStamp);
      const now = q.get();
      const d = now - gr.r;
      // where the hand's momentum would carry the grabbed card, mapped
      // back through the geometry to the card that would end up in focus
      // (offsets run against the screen: x = A − f)
      const target = clamp(Math.round(gr.r + depthFor(offsetAt(d, g) - project(vx), g)), 0, max);
      const vq = -vx / slopeAt(d, g);
      settle(target, vq, Math.abs(vx) > 420);
      if (target !== gr.from) onSnapRef.current?.(target);
    },
    [max, q, settle, swallowClick]
  );

  // a drag is not a click: swallow the click that follows a drag
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // horizontal trackpad swipes: 1:1, then settle on the nearest card
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || count < 2) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !geoRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      anim.current?.stop();
      const g = geoRef.current;
      const w = wheel.current ?? { raw: q.get(), timer: 0 };
      window.clearTimeout(w.timer);
      // fingers moving left scroll right (deltaX > 0): the next card comes in
      const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      w.raw = clamp(w.raw + px / g.R, -0.6, max + 0.6);
      q.set(band(w.raw));
      w.timer = window.setTimeout(() => {
        wheel.current = null;
        settle(Math.round(q.get()));
      }, 140);
      wheel.current = w;
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      vp.removeEventListener("wheel", onWheel);
      if (wheel.current) window.clearTimeout(wheel.current.timer);
    };
  }, [band, count, max, q, settle]);

  useEffect(
    () => () => {
      anim.current?.stop();
      window.clearTimeout(clickTimer.current);
    },
    []
  );

  return {
    q,
    index,
    geo,
    go,
    viewportRef,
    rulerRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClickCapture },
  };
}
