"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { animate, m, useMotionValue, type MotionValue } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { lenisRef } from "@/lib/lenisRef";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { fill } from "../lib";
import { bestIndex, measure, moveTo, sameOrder, slots, type Metrics } from "./layout";
import { useBoardOrder } from "./store";

/* ───────────────────────────── types ───────────────────────────── */

export type WidgetSize = "L" | "T" | "W";

export type BoardWidget = {
  id: string;
  /** L: 2×2, T: 1×2 (tall), W: full width × 1, on the 4-column grid */
  size: WidgetSize;
  label: string;
  accent: string;
  glyph: Cells;
  /** right side of the widget header (status, live dot…) */
  meta?: React.ReactNode;
  children: React.ReactNode;
};

export type BoardStrings = {
  label: string;
  move: string;
  instructions: string;
  picked: string;
  moved: string;
  dropped: string;
  cancelled: string;
};

type Item = {
  el: HTMLElement;
  grip: HTMLButtonElement | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  rotate: MotionValue<number>;
  ox: MotionValue<number>;
  oy: MotionValue<number>;
};

type Sample = { t: number; x: number; y: number };

type Drag = {
  id: string;
  pid: number;
  touch: boolean;
  /** waiting for a long-press (touch) or the move threshold (mouse) */
  pending: "hold" | "threshold" | null;
  timer: number;
  lifted: boolean;
  px0: number;
  py0: number;
  px: number;
  py: number;
  scroll0: number;
  /** layout position and motion offset at the grab */
  bx: number;
  by: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  metrics: Metrics | null;
  boardW: number;
  boardH: number;
  samples: Sample[];
  lastSwap: number;
  startOrder: string[];
};

/* ──────────────────────────── constants ──────────────────────────── */

/** Drags never start on something meant to be clicked or typed into. */
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[contenteditable="true"],[data-no-drag]';
/** touch: how long a finger rests before the widget lifts */
const HOLD_MS = 320;
/** touch: movement that turns a pending hold into a scroll */
const HOLD_SLOP = 10;
/** mouse: movement before a press becomes a drag */
const THRESHOLD = 4;
/** a reorder only wins if it's this much closer than the current slot */
const HYSTERESIS = 28;
/** free travel past the board edges before the rubber band */
const PLAY = 28;

const G_GRIP: Cells = [
  [2, 1], [4, 1],
  [2, 3], [4, 3],
  [2, 5], [4, 5],
];

/** px/s from the last ~80ms of pointer history; 0 when the hand had stopped. */
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

/* ───────────────────────────── state hook ───────────────────────────── */

/**
 * Board state shared between the board and the window toolbar: the
 * persisted order, arrange mode, and a flag that tells the next layout
 * pass to animate (user-made changes glide; the restore on load doesn't).
 */
export function useBoard(defaults: readonly string[]) {
  const { order, isDefault, save, reset } = useBoardOrder(defaults);
  const animateNext = useRef(false);
  const [arrange, setArrange] = useState(false);
  /** the next layout pass animates */
  const flagAnimate = useCallback(() => {
    animateNext.current = true;
  }, []);
  /** read and clear the flag (layout effects only) */
  const takeAnimate = useCallback(() => {
    const v = animateNext.current;
    animateNext.current = false;
    return v;
  }, []);
  const commit = useCallback(
    (next: string[]) => {
      animateNext.current = true;
      save(next);
    },
    [save]
  );
  const resetOrder = useCallback(() => {
    animateNext.current = true;
    reset();
  }, [reset]);
  return { order, isDefault, commit, reset: resetOrder, arrange, setArrange, flagAnimate, takeAnimate };
}
export type BoardState = ReturnType<typeof useBoard>;

/* ───────────────────────────── the board ───────────────────────────── */

/**
 * A dashboard of widgets you rearrange with your hands.
 *
 * - Mouse: press anywhere on a widget (not on a link) and it gives under
 *   the finger; past a few px it lifts and follows 1:1 from the grab point,
 *   tilting a little with its velocity like a card in the hand.
 * - Touch: touch and hold to lift (scrolling stays native), or drag the
 *   grip in Arrange mode.
 * - The others reflow around it live; a dashed slot shows where it lands.
 *   On release the velocity is projected: a throw carries it to the slot
 *   it was thrown at, and it springs there carrying that velocity (a
 *   little bounce only after a real throw). Rubber-banded past the board,
 *   auto-scrolls near the window edges, interruptible mid-flight.
 * - Keyboard: Space on a grip picks the widget up, arrows move it, Space
 *   drops, Escape cancels; every step is announced.
 * - The order persists per device. Reduced motion: everything snaps.
 */
export function Board({
  board,
  widgets,
  strings,
}: {
  board: BoardState;
  widgets: BoardWidget[];
  strings: BoardStrings;
}) {
  const { blip } = useSound();
  const reduced = useReduced();
  const instrId = useId();
  const boardRef = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, Item>());
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const settle = useRef<{ id: string; vx: number; vy: number; thrown: boolean } | null>(null);
  const focusAfter = useRef<string | null>(null);
  const liveRef = useRef<string[]>(board.order);
  const reducedRef = useRef(reduced);
  const rafRef = useRef(0);

  // the order while something is carried (null: the saved order)
  const [live, setLive] = useState<string[] | null>(null);
  const [carry, setCarry] = useState<{ id: string; mode: "pointer" | "keyboard" } | null>(null);
  const [announce, setAnnounce] = useState("");
  const liveOrder = live ?? board.order;

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gw = useMotionValue(0);
  const gh = useMotionValue(0);

  const byId = new Map(widgets.map((w) => [w.id, w]));
  const labelOf = (id: string) => byId.get(id)?.label ?? id;

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const register = useCallback((id: string, item: Item | null) => {
    if (item) items.current.set(id, item);
    else items.current.delete(id);
  }, []);

  /* ── where the dragged widget should be, from the pointer ── */
  const applyDrag = useCallback(() => {
    const d = drag.current;
    if (!d || !d.lifted) return;
    const it = items.current.get(d.id);
    const p = pos.current.get(d.id);
    if (!it || !p) return;
    const dx = d.px - d.px0;
    const dy = d.py - d.py0 + (window.scrollY - d.scroll0);
    // top-left of the widget in board space, rubber-banded past the board
    const left = band(d.bx + d.x0 + dx, -PLAY, d.boardW - d.w + PLAY, d.boardW);
    const top = band(d.by + d.y0 + dy, -PLAY, d.boardH - d.h + PLAY, Math.max(d.boardH, 600));
    it.x.set(left - p.x);
    it.y.set(top - p.y);
  }, []);

  /* ── live reflow: move the carried widget to the slot nearest its centre ── */
  const maybeReorder = useCallback(() => {
    const d = drag.current;
    if (!d || !d.lifted || !d.metrics) return;
    const now = performance.now();
    if (now - d.lastSwap < 90) return;
    const it = items.current.get(d.id);
    const p = pos.current.get(d.id);
    if (!it || !p) return;
    const cx = p.x + it.x.get() + d.w / 2;
    const cy = p.y + it.y.get() + d.h / 2;
    const cur = liveRef.current;
    const here = slots(cur, d.metrics).get(d.id);
    const best = bestIndex(cur, d.id, d.metrics, cx, cy);
    if (!here || best.index === cur.indexOf(d.id)) return;
    const hereDist = Math.hypot(here.x + here.w / 2 - cx, here.y + here.h / 2 - cy);
    if (best.dist + HYSTERESIS > hereDist) return;
    d.lastSwap = now;
    board.flagAnimate();
    setLive(moveTo(cur, d.id, best.index));
    blip("tick");
  }, [blip, board]);

  /* ── per-frame while lifted: edge auto-scroll + tilt easing ── */
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const d = drag.current;
      if (!d || !d.lifted) return;
      const it = items.current.get(d.id);
      // auto-scroll when the finger nears the top (under the title bar) or the Dock
      const bar = document.querySelector(".os-win-bar");
      const top = (bar?.getBoundingClientRect().bottom ?? 100) + 56;
      const bottom = window.innerHeight - (window.innerWidth < 768 ? 96 : 120);
      let v = 0;
      if (d.py < top) v = -Math.min(1, (top - d.py) / 72) * 16;
      else if (d.py > bottom) v = Math.min(1, (d.py - bottom) / 72) * 16;
      if (v) {
        const lenis = lenisRef.current;
        const y = window.scrollY + v;
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        applyDrag();
        maybeReorder();
      }
      // tilt with horizontal velocity, easing back when the hand rests
      if (it && !reducedRef.current) {
        const { vx } = releaseVelocity(d.samples, performance.now());
        const max = Math.max(0.6, Math.min(2.6, 900 / d.w));
        const target = Math.max(-max, Math.min(max, vx / 260));
        it.rotate.set(it.rotate.get() + (target - it.rotate.get()) * 0.18);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [applyDrag, maybeReorder]);

  /* ── springs a widget into its slot, carrying the release velocity ── */
  const runSettle = useCallback(() => {
    const s = settle.current;
    settle.current = null;
    if (!s) return;
    const it = items.current.get(s.id);
    if (!it) return;
    // the shadow lands with it; it stays on top until it's home
    const done = () => {
      if (it.el.dataset.carried !== undefined) return;
      delete it.el.dataset.settling;
    };
    delete it.el.dataset.lifted;
    it.el.dataset.settling = "";
    if (reducedRef.current) {
      it.x.set(0);
      it.y.set(0);
      it.scale.set(1);
      it.rotate.set(0);
      done();
      return;
    }
    const sp = s.thrown ? spring.flick : spring.default;
    animate(it.x, 0, { ...sp, velocity: s.vx });
    animate(it.y, 0, { ...sp, velocity: s.vy });
    animate(it.rotate, 0, spring.default);
    animate(it.scale, 1, spring.default).then(() => {
      if (!drag.current || drag.current.id !== s.id) done();
    });
  }, []);

  /* ── FLIP: after every order change, everything glides to its new slot ── */
  useLayoutEffect(() => {
    liveRef.current = liveOrder;
    const anim = board.takeAnimate();
    const dragging = drag.current?.lifted ? drag.current.id : null;
    for (const [id, it] of items.current) {
      const nx = it.el.offsetLeft;
      const ny = it.el.offsetTop;
      const old = pos.current.get(id);
      pos.current.set(id, { x: nx, y: ny });
      if (!old || !anim) continue;
      const dx = old.x - nx;
      const dy = old.y - ny;
      if (!dx && !dy) continue;
      if (id === dragging) continue; // the hand owns it: re-based below
      if (reducedRef.current && settle.current?.id !== id) continue;
      it.x.set(it.x.get() + dx);
      it.y.set(it.y.get() + dy);
      if (settle.current?.id === id) continue; // springs with its velocity below
      animate(it.x, 0, spring.default);
      animate(it.y, 0, spring.default);
    }
    if (dragging) applyDrag();
    runSettle();

    // the dashed slot follows the carried widget's layout position
    const c = carry && items.current.get(carry.id);
    const p = carry && pos.current.get(carry.id);
    if (c && p) {
      const first = gw.get() === 0;
      gw.set(c.el.offsetWidth);
      gh.set(c.el.offsetHeight);
      if (first || reducedRef.current) {
        gx.set(p.x);
        gy.set(p.y);
      } else {
        animate(gx, p.x, spring.snappy);
        animate(gy, p.y, spring.snappy);
      }
    } else {
      gw.set(0);
    }

    if (focusAfter.current) {
      items.current.get(focusAfter.current)?.grip?.focus({ preventScroll: true });
      focusAfter.current = null;
    }
  }, [liveOrder, carry, board, applyDrag, runSettle, gx, gy, gw, gh]);

  // responsive reflow (window resize, zoom): re-learn positions, no animation
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (drag.current?.lifted) return;
      for (const [id, it] of items.current) pos.current.set(id, { x: it.el.offsetLeft, y: it.el.offsetTop });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── lifting ── */
  const lift = useCallback(() => {
    const d = drag.current;
    const boardEl = boardRef.current;
    if (!d || !boardEl) return;
    const it = items.current.get(d.id);
    if (!it) return;
    d.pending = null;
    d.lifted = true;
    window.clearTimeout(d.timer);
    // positions from this exact moment (the carried one may be mid-spring)
    for (const [id, x] of items.current) pos.current.set(id, { x: x.el.offsetLeft, y: x.el.offsetTop });
    const p = pos.current.get(d.id) ?? { x: 0, y: 0 };
    d.bx = p.x;
    d.by = p.y;
    d.w = it.el.offsetWidth;
    d.h = it.el.offsetHeight;
    d.boardW = boardEl.clientWidth;
    d.boardH = boardEl.scrollHeight;
    const els = new Map<string, HTMLElement>();
    for (const [id, x] of items.current) els.set(id, x.el);
    d.metrics = measure(boardEl, els);
    d.startOrder = [...liveRef.current];
    it.el.dataset.lifted = "";
    if (reducedRef.current) it.scale.set(1.02);
    else animate(it.scale, 1.035, spring.snappy);
    if (d.touch) navigator.vibrate?.(8);
    setLive([...liveRef.current]);
    setCarry({ id: d.id, mode: "pointer" });
    startLoop();
  }, [startLoop]);

  const onItemPointerDown = useCallback(
    (id: string, e: React.PointerEvent, viaGrip: boolean) => {
      if (e.button !== 0 || drag.current || carry) return;
      if (!viaGrip && (e.target as Element).closest(INTERACTIVE)) return;
      const it = items.current.get(id);
      const boardEl = boardRef.current;
      if (!it || !boardEl) return;
      const touch = e.pointerType === "touch";
      if (!touch) e.preventDefault(); // no text selection, no native image drag
      // interrupt any spring in flight: continue from where it is
      it.x.stop();
      it.y.stop();
      it.scale.stop();
      it.rotate.stop();
      // scale about the grab point so the hand never slips
      const r = it.el.getBoundingClientRect();
      it.ox.set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
      it.oy.set(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)));
      const now = performance.now();
      drag.current = {
        id,
        pid: e.pointerId,
        touch,
        pending: viaGrip ? null : touch ? "hold" : "threshold",
        timer: 0,
        lifted: false,
        px0: e.clientX,
        py0: e.clientY,
        px: e.clientX,
        py: e.clientY,
        scroll0: window.scrollY,
        bx: 0,
        by: 0,
        x0: it.x.get(),
        y0: it.y.get(),
        w: 0,
        h: 0,
        metrics: null,
        boardW: 0,
        boardH: 0,
        samples: [{ t: now, x: e.clientX, y: e.clientY }],
        lastSwap: 0,
        startOrder: [...liveRef.current],
      };
      try {
        boardEl.setPointerCapture(e.pointerId);
      } catch {}
      // respond on pointer-down: the widget gives a little under the finger
      if (!reducedRef.current) animate(it.scale, viaGrip ? 1 : 0.985, spring.snappy);
      if (viaGrip) lift();
      else if (touch) drag.current.timer = window.setTimeout(lift, HOLD_MS);
    },
    [carry, lift]
  );

  /* ── release: project the throw, pick the slot, spring into it ── */
  const end = useCallback(
    (e: { pointerId: number; type: string } | null, cancel = false) => {
      const d = drag.current;
      if (!d || (e && e.pointerId !== d.pid)) return;
      drag.current = null;
      window.clearTimeout(d.timer);
      cancelAnimationFrame(rafRef.current);
      try {
        if (e) boardRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
      const it = items.current.get(d.id);
      if (!it) return;
      if (!d.lifted) {
        animate(it.scale, 1, spring.snappy);
        return;
      }
      const cur = liveRef.current;
      let next = cur;
      let vx = 0;
      let vy = 0;
      if (cancel) {
        next = d.startOrder;
      } else if (d.metrics) {
        ({ vx, vy } = releaseVelocity(d.samples, performance.now()));
        const p = pos.current.get(d.id) ?? { x: 0, y: 0 };
        let jx = project(vx, 0.996);
        let jy = project(vy, 0.996);
        const len = Math.hypot(jx, jy);
        if (len > 520) {
          jx *= 520 / len;
          jy *= 520 / len;
        }
        const cx = p.x + it.x.get() + d.w / 2 + jx;
        const cy = p.y + it.y.get() + d.h / 2 + jy;
        next = moveTo(cur, d.id, bestIndex(cur, d.id, d.metrics, cx, cy).index);
      }
      settle.current = { id: d.id, vx, vy, thrown: Math.hypot(vx, vy) > 700 };
      board.flagAnimate();
      setLive(null);
      setCarry(null);
      if (!sameOrder(next, board.order)) board.commit(next);
      if (!cancel) blip("select");
      // swallow the click a drag would otherwise end with
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    },
    [blip, board]
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pid) return;
    d.px = e.clientX;
    d.py = e.clientY;
    const t = performance.now();
    d.samples.push({ t, x: e.clientX, y: e.clientY });
    if (d.samples.length > 24) d.samples.shift();
    if (!d.lifted) {
      const dist = Math.hypot(d.px - d.px0, d.py - d.py0);
      if (d.pending === "hold") {
        if (dist > HOLD_SLOP) {
          // it was a scroll after all
          window.clearTimeout(d.timer);
          drag.current = null;
          const it = items.current.get(d.id);
          if (it) animate(it.scale, 1, spring.snappy);
        }
        return;
      }
      if (dist < THRESHOLD) return;
      lift();
    }
    applyDrag();
    maybeReorder();
  };

  // while lifted: block touch scrolling, follow wheel scrolls, Esc cancels
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (drag.current?.lifted) e.preventDefault();
    };
    const onContext = (e: Event) => {
      if (drag.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("contextmenu", onContext);
    return () => {
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("contextmenu", onContext);
    };
  }, []);

  useEffect(() => {
    if (carry?.mode !== "pointer") return;
    const onScroll = () => {
      applyDrag();
      maybeReorder();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        end(drag.current ? { pointerId: drag.current.pid, type: "cancel" } : null, true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [carry, applyDrag, maybeReorder, end]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      if (drag.current) window.clearTimeout(drag.current.timer);
    },
    []
  );

  /* ── keyboard ── */
  const say = (tpl: string, id: string, order: string[]) =>
    setAnnounce(fill(tpl, { name: labelOf(id), pos: order.indexOf(id) + 1, total: order.length }));

  const keyDrop = (id: string, cancel = false, keepFocus = true) => {
    const next = cancel ? board.order : liveOrder;
    board.flagAnimate();
    settle.current = { id, vx: 0, vy: 0, thrown: false };
    // committing moves the widget in the DOM: hand focus back to its grip
    if (keepFocus) focusAfter.current = id;
    setLive(null);
    setCarry(null);
    if (!cancel && !sameOrder(next, board.order)) board.commit(next);
    say(cancel ? strings.cancelled : strings.dropped, id, next);
    if (!cancel) blip("select");
  };

  const onGripKeyDown = (id: string, e: React.KeyboardEvent) => {
    const carrying = carry?.mode === "keyboard" && carry.id === id;
    if (!carrying) {
      if (e.key !== " " && e.key !== "Enter") return;
      if (carry || drag.current) return;
      e.preventDefault();
      const it = items.current.get(id);
      if (!it) return;
      it.ox.set(0.5);
      it.oy.set(0.5);
      it.el.dataset.lifted = "";
      if (reducedRef.current) it.scale.set(1.02);
      else animate(it.scale, 1.03, spring.snappy);
      setLive([...board.order]);
      setCarry({ id, mode: "keyboard" });
      say(strings.picked, id, board.order);
      return;
    }
    const cur = liveOrder;
    const i = cur.indexOf(id);
    let to = i;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        to = i - 1;
        break;
      case "ArrowRight":
      case "ArrowDown":
        to = i + 1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = cur.length - 1;
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        keyDrop(id);
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        keyDrop(id, true);
        return;
      case "Tab":
        keyDrop(id, false, false);
        return;
      default:
        return;
    }
    e.preventDefault();
    to = Math.max(0, Math.min(cur.length - 1, to));
    if (to === i) return;
    const next = moveTo(cur, id, to);
    board.flagAnimate();
    setLive(next);
    say(strings.moved, id, next);
    blip("tick");
  };

  const onGripBlur = (id: string) => {
    if (carry?.mode === "keyboard" && carry.id === id && !focusAfter.current) keyDrop(id, false, false);
  };

  return (
    <section
      className="app-now-boardwrap"
      aria-label={strings.label}
    >
      <p id={instrId} className="sr-only">
        {strings.instructions}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <div
        ref={boardRef}
        className="app-now-board"
        data-arrange={board.arrange || undefined}
        data-carrying={carry ? carry.mode : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, !drag.current?.lifted)}
        onLostPointerCapture={(e) => {
          if (drag.current && e.pointerId === drag.current.pid) end(e);
        }}
      >
        <m.div aria-hidden className="app-now-ghost" data-on={carry ? "" : undefined} style={{ x: gx, y: gy, width: gw, height: gh }} />
        {board.order.map((id) => {
          const w = byId.get(id);
          if (!w) return null;
          return (
            <BoardItem
              key={id}
              w={w}
              order={liveOrder.indexOf(id)}
              register={register}
              onPointerDown={onItemPointerDown}
              onGripKeyDown={onGripKeyDown}
              onGripBlur={onGripBlur}
              carried={carry?.id === id}
              moveLabel={fill(strings.move, { name: w.label })}
              instrId={instrId}
            />
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────────── one widget ───────────────────────────── */

function BoardItem({
  w,
  order,
  register,
  onPointerDown,
  onGripKeyDown,
  onGripBlur,
  carried,
  moveLabel,
  instrId,
}: {
  w: BoardWidget;
  order: number;
  register: (id: string, item: Item | null) => void;
  onPointerDown: (id: string, e: React.PointerEvent, viaGrip: boolean) => void;
  onGripKeyDown: (id: string, e: React.KeyboardEvent) => void;
  onGripBlur: (id: string) => void;
  carried: boolean;
  moveLabel: string;
  instrId: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const gripRef = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const ox = useMotionValue(0.5);
  const oy = useMotionValue(0.5);
  const headId = `app-now-h-${w.id}`;

  useLayoutEffect(() => {
    if (!ref.current) return;
    register(w.id, { el: ref.current, grip: gripRef.current, x, y, scale, rotate, ox, oy });
    return () => register(w.id, null);
  }, [register, w.id, x, y, scale, rotate, ox, oy]);

  return (
    <m.article
      ref={ref}
      className="app-now-w"
      data-size={w.size}
      data-id={w.id}
      data-carried={carried || undefined}
      aria-labelledby={headId}
      onPointerDown={(e) => onPointerDown(w.id, e, false)}
      style={
        {
          order,
          x,
          y,
          scale,
          rotate,
          originX: ox,
          originY: oy,
          "--app-now-accent": w.accent,
        } as React.ComponentProps<typeof m.article>["style"]
      }
    >
      <span className="app-now-w-lift" aria-hidden />
      <div className="app-now-w-card">
        <header className="app-now-w-head">
          <span className="app-now-w-glyph" aria-hidden>
            <PixelGlyph cells={w.glyph} size={14} />
          </span>
          <h2 id={headId} className="app-now-w-title">
            {w.label}
          </h2>
          {w.meta && <div className="app-now-w-meta">{w.meta}</div>}
          <button
            ref={gripRef}
            type="button"
            className="app-now-w-grip"
            aria-label={moveLabel}
            aria-describedby={instrId}
            aria-pressed={carried}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(w.id, e, true);
            }}
            onKeyDown={(e) => onGripKeyDown(w.id, e)}
            onBlur={() => onGripBlur(w.id)}
          >
            <PixelGlyph cells={G_GRIP} size={14} />
          </button>
        </header>
        <div className="app-now-w-body">{w.children}</div>
      </div>
    </m.article>
  );
}
