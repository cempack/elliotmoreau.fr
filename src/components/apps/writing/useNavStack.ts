"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue, useTransform, type Transition } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { lenisRef } from "@/lib/lenisRef";

export type View = "list" | "reader";

/** a press this close to the left edge always means "back" */
const EDGE = 28;
/** iOS-like push/pop: critically damped, a touch slower than default */
const PUSH: Transition = { type: "spring", visualDuration: 0.42, bounce: 0 };
/** how far the list sits to the left while the reader covers it */
const PARALLAX = 0.3;
/** "off to the right" before the stack has been measured */
const OFF = 100_000;

function scrollToY(y: number) {
  const l = lenisRef.current;
  if (l) l.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo({ top: y, behavior: "instant" });
}

type Drag = {
  id: number;
  x0: number;
  y0: number;
  edge: boolean;
  active: boolean;
  base: number;
  grabX: number;
  w: number;
  samples: { t: number; x: number }[];
};

type Run = { kind: "push" | "pop"; n: number; v: number };

/**
 * The phone layout of Writing: an iOS navigation stack of two screens in
 * the page's own scroll. The list stays in flow until a post is pushed;
 * then the reader takes the flow and the list is pinned (absolute, at its
 * old scroll offset) underneath for the length of the transition, so
 * both screens keep their own scroll position.
 *
 * Back: the button, Esc, the browser, or a swipe right from the left edge
 * (or anywhere, once the move is clearly horizontal). The reader tracks
 * the finger 1:1 from where it was grabbed, rubber-bands past its rest,
 * and on release the projected endpoint (velocity × deceleration) picks
 * pop or stay; the spring then carries the release velocity. A settling
 * transition can be grabbed again mid-flight.
 */
export function useNavStack({
  enabled,
  reduced,
  stackRef,
  probeRef,
  onSettle,
}: {
  enabled: boolean;
  reduced: boolean;
  stackRef: React.RefObject<HTMLDivElement | null>;
  /** a sticky probe: its computed `top` is the line under the title bar */
  probeRef: React.RefObject<HTMLElement | null>;
  /** a push or pop finished; `fromHistory` when the browser asked for it */
  onSettle: (view: View, fromHistory: boolean) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [moving, setMoving] = useState(false);
  const [run, setRun] = useState<Run | null>(null);

  // reader offset in px: 0 = covering the list, ≥ w = off to the right
  // (starts far off so the list rests untransformed before any measure)
  const x = useMotionValue(OFF);
  const width = useMotionValue(390);
  const listX = useTransform(() => -PARALLAX * Math.max(0, width.get() - x.get()));
  // the list only paints where the reader isn't (both are see-through glass)
  const listClip = useTransform(() => `inset(0 ${Math.max(0, (1 - PARALLAX) * (width.get() - x.get())).toFixed(1)}px 0 0)`);
  const shade = useTransform(() => 1 - Math.min(1, Math.max(0, x.get() / Math.max(1, width.get()))));

  const savedY = useRef(0);
  const restoreY = useRef<number | null>(null);
  const token = useRef(0);
  const animating = useRef(false);
  const fromHistory = useRef(false);
  const drag = useRef<Drag | null>(null);
  const handled = useRef<Run | null>(null);
  const onSettleRef = useRef(onSettle);
  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  const pinList = useCallback(
    (scrollY: number) => {
      stackRef.current?.style.setProperty("--app-writing-under-y", `${Math.round(scrollY - savedY.current)}px`);
    },
    [stackRef]
  );

  /** the reader is gone: list back in flow, scroll restored before paint */
  const finishPop = useCallback(() => {
    restoreY.current = savedY.current;
    setView("list");
    setMoving(false);
    onSettleRef.current("list", fromHistory.current);
    fromHistory.current = false;
  }, []);

  const push = useCallback(() => {
    if (!enabled) {
      setView("reader");
      return;
    }
    if (view === "reader" && !moving) return;
    token.current++;
    animating.current = false;
    drag.current = null;
    savedY.current = window.scrollY;
    setView("reader");
    if (!reduced) setMoving(true);
    setRun((r) => ({ kind: "push", n: (r?.n ?? 0) + 1, v: 0 }));
  }, [enabled, reduced, view, moving]);

  const pop = useCallback(
    (opts?: { fromHistory?: boolean; velocity?: number }) => {
      if (view !== "reader") return;
      fromHistory.current = !!opts?.fromHistory;
      if (!enabled || reduced) {
        token.current++;
        finishPop();
        return;
      }
      token.current++;
      drag.current = null;
      setMoving(true);
      setRun((r) => ({ kind: "pop", n: (r?.n ?? 0) + 1, v: opts?.velocity ?? 0 }));
    },
    [view, enabled, reduced, finishPop]
  );

  /** show a screen with no transition (deep links, layout changes) */
  const jump = useCallback(
    (next: View) => {
      token.current++;
      animating.current = false;
      drag.current = null;
      x.jump(next === "reader" ? 0 : width.get());
      savedY.current = 0;
      setView(next);
      setMoving(false);
    },
    [x, width]
  );

  // run a push / pop once React has put both screens on the page
  useLayoutEffect(() => {
    if (!run || handled.current === run) return;
    handled.current = run;
    const stack = stackRef.current;
    if (!stack) return;
    const w = stack.clientWidth || window.innerWidth;
    width.set(w);
    const my = ++token.current;
    if (run.kind === "push") {
      // the reader opens at the top: scroll up to it if the list was scrolled
      const probe = probeRef.current;
      const stick = probe ? parseFloat(getComputedStyle(probe).top) || 0 : 0;
      const top = stack.getBoundingClientRect().top + window.scrollY;
      const target = Math.min(savedY.current, Math.max(0, Math.round(top - stick)));
      if (Math.abs(window.scrollY - target) > 1) scrollToY(target);
      pinList(target);
      if (reduced) {
        x.jump(0);
        return;
      }
      x.jump(w);
      animating.current = true;
      animate(x, 0, PUSH).then(() => {
        if (my !== token.current) return;
        animating.current = false;
        setMoving(false);
        onSettleRef.current("reader", false);
      });
    } else {
      pinList(window.scrollY);
      animating.current = true;
      animate(x, w, { ...PUSH, velocity: run.v }).then(() => {
        if (my !== token.current) return;
        animating.current = false;
        finishPop();
      });
    }
  }, [run, stackRef, probeRef, width, x, reduced, pinList, finishPop]);

  // reduced motion: a push settles on the next frame (the CSS cross-fade runs)
  useEffect(() => {
    if (!run || run.kind !== "push" || !reduced) return;
    const id = requestAnimationFrame(() => onSettleRef.current("reader", false));
    return () => cancelAnimationFrame(id);
  }, [run, reduced]);

  // list back in flow: put it back exactly where it was
  useLayoutEffect(() => {
    if (view !== "list" || moving || restoreY.current == null) return;
    scrollToY(restoreY.current);
    restoreY.current = null;
  }, [view, moving]);

  // if the user scrolls while a transition settles, keep the list pinned
  useEffect(() => {
    if (!moving) return;
    const onScroll = () => pinList(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [moving, pinList]);

  // a wider viewport has no stack: drop any half-finished gesture
  useEffect(() => {
    if (enabled) return;
    token.current++;
    drag.current = null;
    animating.current = false;
  }, [enabled]);

  /* ── the swipe back ── */

  /** take the reader: from the press point (it lands under the finger), or
      from right here when catching it mid-flight */
  const begin = (e: React.PointerEvent<HTMLElement>, d: Drag, fromPress: boolean) => {
    token.current++; // a settling transition is now the finger's
    animating.current = false;
    x.stop();
    d.active = true;
    d.base = x.get();
    d.grabX = fromPress ? d.x0 : e.clientX;
    width.set(d.w);
    if (!moving) {
      pinList(window.scrollY);
      setMoving(true);
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const settle = (complete: boolean, v: number, w: number) => {
    if (complete) fromHistory.current = false;
    const target = complete ? w : 0;
    const my = ++token.current;
    if (reduced) {
      x.jump(target);
      if (complete) finishPop();
      else setMoving(false);
      return;
    }
    animating.current = true;
    animate(x, target, { ...spring.default, velocity: v }).then(() => {
      if (my !== token.current) return;
      animating.current = false;
      if (complete) finishPop();
      else setMoving(false);
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || view !== "reader" || e.button !== 0 || !e.isPrimary) return;
    const stack = stackRef.current;
    if (!stack) return;
    const r = stack.getBoundingClientRect();
    const edge = e.clientX - r.left <= EDGE;
    if (e.pointerType === "mouse" && !edge) return;
    const d: Drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, edge, active: false, base: 0, grabX: 0, w: r.width, samples: [] };
    drag.current = d;
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    // catching a reader that is still sliding: it stops under the finger
    if (animating.current && moving) begin(e, d, false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      const horizontal = d.edge ? dx > 4 && dx > Math.abs(dy) : dx > 10 && dx > Math.abs(dy) * 1.5;
      if (horizontal) begin(e, d, true);
      else {
        if (Math.abs(dy) > 10 || dx < -10) drag.current = null;
        return;
      }
    }
    let nx = d.base + (e.clientX - d.grabX);
    if (nx < 0) nx = -rubberband(-nx, d.w);
    x.set(nx);
    d.samples.push({ t: e.timeStamp, x: e.clientX });
    if (d.samples.length > 8) d.samples.shift();
  };

  const release = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.active) return;
    // a drag is not a tap: swallow the click it would end in
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 80);

    // release velocity over the last ~100ms of movement (at least the last
    // two samples, unless the finger had stopped before letting go)
    let v = 0;
    if (!cancelled) {
      d.samples.push({ t: e.timeStamp, x: e.clientX });
      const last = d.samples[d.samples.length - 1];
      let first = d.samples.length - 2;
      while (first > 0 && last.t - d.samples[first - 1].t <= 100) first--;
      const a = d.samples[Math.max(0, first)];
      const dt = (last.t - a.t) / 1000;
      const idle = last.t - d.samples[Math.max(0, d.samples.length - 2)].t;
      if (dt > 0 && idle < 120) v = (last.x - a.x) / dt;
    }
    const cur = x.get();
    const complete = cur + project(v) > d.w * 0.5 && v > -120;
    settle(complete, v, d.w);
  };

  const bind = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => release(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => release(e, true),
  };

  return { view, moving, push, pop, jump, bind, x, listX, listClip, shade };
}
