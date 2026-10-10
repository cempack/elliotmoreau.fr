"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls } from "motion/react";
import { clamp, project, rubberband, spring } from "@/lib/motion";

/**
 * App-switcher geometry, iOS style. The focused card sits right-aligned
 * to the content column; cards still to come pile up to its left, sliding
 * under it and shrinking into depth; cards already seen leave to the
 * right at full size. `q` is the continuous focus rank (0 = first
 * project), and a card of rank r sits at d = q − r:
 *
 *   x(d) = A + f(d),  f(d) = d·R                        for d ≥ 0
 *                      f(d) = L·d − D·(1 − e^{k·d})     for d < 0
 *
 * with k = (R − L) / D so the slope is continuous through d = 0 (no kink
 * when a card slides into the pile) and f is convex and invertible.
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
  const A = right - W;
  const P = Math.max(24, A - left);
  const R = W + clamp(W * 0.045, 14, 30);
  const L = P * 0.075;
  const D = P - 4 * L;
  return { A, W, R, L, D, k: (R - L) / D, vw, shrink: P > 200 ? 0.045 : 0.03, roomy: P > 220 };
}

export const offsetAt = (d: number, g: DeckGeo) => (d >= 0 ? d * g.R : g.L * d - g.D * (1 - Math.exp(g.k * d)));
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
  dragging: boolean;
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
      const now = q.get();
      const hit = (e.target as Element).closest<HTMLElement>("[data-deck-card]");
      const hitRank = hit ? Number(hit.dataset.deckCard) : Math.round(now);
      // deep pile cards are thin slivers: drive with the first one instead
      const r = clamp(hitRank, Math.round(now) - 1, max);
      grab.current = {
        pid: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        r,
        y0: offsetAt(now - r, g),
        from: Math.round(now),
        dragging: false,
        samples: [{ t: e.timeStamp, x: e.clientX }],
        el: hit,
      };
      if (hit) hit.dataset.pressed = "";
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
          // re-anchor so the first frame of the drag doesn't jump the slop
          gr.sx = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.dragging = "";
        } else if (Math.abs(dy) > 10) {
          if (gr.el) delete gr.el.dataset.pressed;
          grab.current = null;
        }
        return;
      }
      gr.samples.push({ t: e.timeStamp, x: e.clientX });
      if (gr.samples.length > 12) gr.samples.shift();
      const raw = gr.r + depthFor(gr.y0 + (e.clientX - gr.sx), g);
      q.set(band(raw));
    },
    [band, q]
  );

  const end = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const gr = grab.current;
      const g = geoRef.current;
      if (!gr || e.pointerId !== gr.pid) return;
      grab.current = null;
      if (gr.el) delete gr.el.dataset.pressed;
      delete e.currentTarget.dataset.dragging;
      if (!gr.dragging || !g) return;
      suppressClick.current = true;
      const vx = e.type === "pointercancel" ? 0 : releaseVelocity(gr.samples, e.timeStamp);
      const now = q.get();
      const d = now - gr.r;
      // where the hand's momentum would carry the grabbed card, mapped
      // back through the geometry to the card that would end up in focus
      const target = clamp(Math.round(gr.r + depthFor(offsetAt(d, g) + project(vx), g)), 0, max);
      const vq = vx / slopeAt(d, g);
      settle(target, vq, Math.abs(vx) > 420);
      if (target !== gr.from) onSnapRef.current?.(target);
    },
    [max, q, settle]
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
      // fingers moving right scroll left (deltaX < 0) and pull the deck right
      const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      w.raw = clamp(w.raw - px / g.R, -0.6, max + 0.6);
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

  useEffect(() => () => anim.current?.stop(), []);

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
