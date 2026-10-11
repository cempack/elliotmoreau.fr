"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { pushSample, releaseVelocity, swallowNextClick, type Sample } from "./gesture";

/** 1 = the older post (next in the list), -1 = the newer one */
export type Dir = 1 | -1;

/** the drag that arms a turn, as a share of the reader's width */
const ARM = 0.22;
/** a trackpad swipe this far turns at once (its momentum tail is swallowed) */
const COMMIT = 0.42;
/** no wheel event for this long: the fingers (and their momentum) are done */
const GAP_MS = 140;
/** after a turn, wheel events keep being swallowed until a pause this long */
const LOCK_MS = 220;

type Phase = "idle" | "drag" | "turning" | "locked";
type Touch = { id: number; x0: number; y0: number; base: number; active: boolean; samples: Sample[] };

/**
 * Desktop and tablet: turn the reader's page sideways. A two-finger
 * trackpad swipe (wheel deltaX) or a touch drag moves the copy 1:1, the
 * plate's layers follow in whole-cell parallax, and a hint grows at the
 * edge it is heading for. Past the arm point the hint lights up; let go
 * and the projected endpoint decides: turn to the older / newer post
 * (the copy carries on out with the gesture's velocity and the next one
 * slides in from the other side) or spring back. With nothing further
 * that way it rubber-bands. ←/→ and the pager use the same turn (`go`).
 */
export function usePageSwipe({
  enabled,
  reduced,
  paneRef,
  can,
  onTurn,
  onArm,
}: {
  enabled: boolean;
  reduced: boolean;
  paneRef: React.RefObject<HTMLElement | null>;
  /** is there a post that way? */
  can: (dir: Dir) => boolean;
  /** swap to the post that way (the copy is out of sight when this runs) */
  onTurn: (dir: Dir) => void;
  /** the drag crossed the arm point (dir) or fell back under it (0) */
  onArm?: (dir: Dir | 0) => void;
}) {
  /** the copy's offset (px) and opacity */
  const x = useMotionValue(0);
  const fade = useMotionValue(1);
  /** signed progress towards a turn during a drag: ±1 = armed (+ = older) */
  const hint = useMotionValue(0);
  const width = useMotionValue(720);
  /** the plate's parallax share of the motion, in plate shift units */
  const drift = useTransform(() => -x.get() / Math.max(1, width.get() * ARM));

  const g = useRef({ phase: "idle" as Phase, raw: 0, samples: [] as Sample[], gap: 0, lock: 0, token: 0, armed: 0 as Dir | 0, vertical: -1e9 });
  const touch = useRef<Touch | null>(null);
  const cb = useRef({ can, onTurn, onArm });
  useEffect(() => {
    cb.current = { can, onTurn, onArm };
  });

  const measure = () => {
    const w = paneRef.current?.clientWidth || 720;
    width.set(w);
    return w;
  };

  const arm = (next: Dir | 0) => {
    if (g.current.armed === next) return;
    g.current.armed = next;
    cb.current.onArm?.(next);
  };

  /** follow the gesture: raw offset → copy, fade, hint */
  const apply = (raw: number) => {
    const w = width.get();
    const dir: Dir = raw < 0 ? 1 : -1;
    const open = cb.current.can(dir);
    const off = open ? raw : Math.sign(raw) * rubberband(Math.abs(raw), w * 0.5);
    x.set(off);
    // the page lets go of its ink as it leaves
    fade.set(1 - Math.min(1, Math.abs(off) / (w * 0.32)) * 0.72);
    const p = -off / (w * ARM);
    hint.set(p);
    arm(open && Math.abs(p) >= 1 ? dir : 0);
  };

  const settleBack = (v: number) => {
    g.current.phase = "idle";
    arm(0);
    animate(x, 0, { ...spring.default, velocity: v });
    animate(fade, 1, { duration: 0.2, ease: [0.22, 1, 0.36, 1] });
    animate(hint, 0, spring.snappy);
  };

  const turn = (dir: Dir, v: number, wheel: boolean) => {
    const s = g.current;
    const my = ++s.token;
    s.phase = "turning";
    arm(0);
    animate(hint, 0, { duration: 0.12 });
    if (reduced) {
      cb.current.onTurn(dir);
      x.jump(0);
      fade.jump(1);
      s.phase = "idle";
      return;
    }
    const w = width.get() || measure();
    // out with the gesture…
    animate(x, -dir * w * 0.45, { type: "spring", visualDuration: 0.24, bounce: 0, velocity: v });
    animate(fade, 0, { duration: 0.12, ease: [0.4, 0, 1, 1] }).then(() => {
      if (my !== s.token) return;
      // …and the next page in from the other side
      cb.current.onTurn(dir);
      x.jump(dir * w * 0.18);
      animate(x, 0, spring.default);
      animate(fade, 1, { duration: 0.3, delay: 0.08, ease: [0.22, 1, 0.36, 1] });
      if (wheel) {
        s.phase = "locked";
        window.clearTimeout(s.lock);
        s.lock = window.setTimeout(() => {
          if (s.phase === "locked") s.phase = "idle";
        }, LOCK_MS);
      } else s.phase = "idle";
    });
  };

  /** keyboard and pager: the same turn, or a nudge at the end of the line */
  const go = (dir: Dir) => {
    if (g.current.phase === "drag" || g.current.phase === "turning") return;
    if (!enabled) {
      if (cb.current.can(dir)) cb.current.onTurn(dir);
      return;
    }
    measure();
    if (cb.current.can(dir)) {
      turn(dir, 0, false);
      return;
    }
    if (reduced) return;
    animate(x, [x.get(), -dir * 22, 0], { duration: 0.42, times: [0, 0.35, 1], ease: [[0.22, 1, 0.36, 1], [0.32, 0, 0.2, 1]] });
  };

  // two-finger trackpad swipes over the reader
  useEffect(() => {
    const pane = paneRef.current;
    if (!enabled || !pane) return;
    const s = g.current;
    const release = () => {
      if (s.phase !== "drag") return;
      // the gap means the momentum is spent: the offset alone decides
      const off = x.get();
      const dir: Dir = off < 0 ? 1 : -1;
      if (Math.abs(off) >= width.get() * ARM && cb.current.can(dir)) turn(dir, 0, true);
      else settleBack(0);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (s.phase === "locked" || s.phase === "turning") {
        if (Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (s.phase === "locked") {
          window.clearTimeout(s.lock);
          s.lock = window.setTimeout(() => {
            if (s.phase === "locked") s.phase = "idle";
          }, LOCK_MS);
        }
        return;
      }
      if (s.phase !== "drag") {
        // a vertical scroll (and its momentum) never turns into a page turn
        if (Math.abs(dy) >= Math.abs(dx)) s.vertical = e.timeStamp;
        if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(dy) * 1.3 || e.timeStamp - s.vertical < 200) return;
        s.token++;
        s.phase = "drag";
        x.stop();
        fade.stop();
        measure();
        s.raw = x.get();
        s.samples = [];
      }
      // ours now: no page scroll, no browser back/forward swipe
      e.preventDefault();
      e.stopPropagation();
      s.raw -= dx;
      apply(s.raw);
      pushSample(s.samples, e.timeStamp, s.raw);
      window.clearTimeout(s.gap);
      s.gap = window.setTimeout(release, GAP_MS);
      const dir: Dir = s.raw < 0 ? 1 : -1;
      if (Math.abs(s.raw) >= width.get() * COMMIT && cb.current.can(dir)) {
        window.clearTimeout(s.gap);
        turn(dir, releaseVelocity(s.samples), true);
      }
    };
    pane.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      pane.removeEventListener("wheel", onWheel);
      window.clearTimeout(s.gap);
      window.clearTimeout(s.lock);
      if (s.phase === "drag") settleBack(0);
      s.phase = "idle";
    };
    // x/fade/hint/width are stable motion values; the rest read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paneRef]);

  /* touch and pen (tablets): the same page under a finger */
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!enabled || e.pointerType === "mouse" || !e.isPrimary || g.current.phase === "turning") return;
    touch.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, base: 0, active: false, samples: [] };
    pushSample(touch.current.samples, e.timeStamp, e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x0;
    const dy = e.clientY - t.y0;
    if (!t.active) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        t.active = true;
        g.current.token++;
        g.current.phase = "drag";
        x.stop();
        fade.stop();
        measure();
        t.base = x.get();
        // grab from here: no jump by the slop
        t.x0 = e.clientX;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
      } else {
        if (Math.abs(dy) > 10) touch.current = null;
        return;
      }
    }
    apply(t.base + (e.clientX - t.x0));
    pushSample(t.samples, e.timeStamp, e.clientX);
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    touch.current = null;
    if (!t.active) return;
    swallowNextClick();
    let v = 0;
    if (!cancelled) {
      pushSample(t.samples, e.timeStamp, e.clientX);
      v = releaseVelocity(t.samples);
    }
    const off = x.get();
    const dir: Dir = off < 0 ? 1 : -1;
    const projected = off + project(v);
    if (!cancelled && Math.abs(off) > 12 && cb.current.can(dir) && Math.sign(projected) === Math.sign(off) && Math.abs(projected) >= width.get() * ARM) {
      turn(dir, v, false);
    } else settleBack(v);
  };

  const bind = enabled
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => onPointerEnd(e, false),
        onPointerCancel: (e: React.PointerEvent<HTMLElement>) => onPointerEnd(e, true),
      }
    : {};

  return { x, fade, hint, drift, go, bind };
}
