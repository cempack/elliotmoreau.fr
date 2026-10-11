"use client";

import { useEffect, type RefObject } from "react";

/** Resting icon size in the desktop dock (CSS px). */
export const DOCK_ICON = 48;
/** Icon size under the pointer at full magnification. */
export const DOCK_MAX = 72;
/** How far the pointer's influence reaches on each side (~2.8 icons). */
const RANGE = 150;
/** Extra rise at full magnification, on top of growing from the shelf. */
const LIFT = 5;

/**
 * Critically damped spring with an exact step (stable at any frame time).
 * `w` is the natural frequency, 2π / response.
 */
type Spring = { x: number; v: number; to: number; w: number };

const makeSpring = (response: number): Spring => ({ x: 0, v: 0, to: 0, w: (2 * Math.PI) / response });

function step(s: Spring, dt: number) {
  const x0 = s.x - s.to;
  const c = s.v + s.w * x0;
  const e = Math.exp(-s.w * dt);
  s.x = s.to + (x0 + c * dt) * e;
  s.v = (c - s.w * (x0 + c * dt)) * e;
}

const settled = (s: Spring, eps: number) => Math.abs(s.x - s.to) < eps && Math.abs(s.v) < eps * 20;

/** Smooth bell: 1 under the pointer, 0 at ±RANGE, flat at both ends. */
const falloff = (d: number) => (d >= RANGE ? 0 : (1 + Math.cos((Math.PI * d) / RANGE)) / 2);

/**
 * macOS dock magnification, transform-only.
 *
 * Two springs drive everything: the pointer's x along the shelf (very
 * short response, so a jump never pops) and the overall intensity (eases
 * in on enter, out on leave, and is interruptible both ways). Each icon's
 * scale is a pure function of those two, measured against the *resting*
 * layout so there is no feedback loop. Items then slide apart by exactly
 * the width the magnified icons gained, centred on the dock, and the glass
 * plate stretches by the same amount. One rAF loop, only while moving;
 * React never re-renders.
 *
 * Markup contract inside `list`: `[data-dock-item]` for every slot (in
 * order), `[data-dock-scale]` on the ones that magnify, and inside each a
 * `[data-dock-icon]` (scaled from its bottom edge) and optionally a
 * `[data-dock-tip]` (rides above the icon).
 */
export function useMagnification(
  zoneRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  plateRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    const zone = zoneRef.current;
    const list = listRef.current;
    const plate = plateRef.current;
    if (!zone || !list || !plate) return;

    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-dock-item]"));
    const icons = items.map((el) => el.querySelector<HTMLElement>("[data-dock-icon]"));
    const tips = items.map((el) => el.querySelector<HTMLElement>("[data-dock-tip]"));
    const scalable = items.map((el) => el.hasAttribute("data-dock-scale"));
    const n = items.length;

    const clear = () => {
      for (let i = 0; i < n; i++) {
        items[i].style.transform = "";
        if (icons[i]) icons[i]!.style.transform = "";
        if (tips[i]) tips[i]!.style.translate = "";
      }
      plate.style.transform = "";
    };

    if (!enabled) {
      clear();
      return;
    }

    const px = makeSpring(0.09);
    const k = makeSpring(0.3);
    const extra = new Float64Array(n);
    let centers: number[] = [];
    let plateW = 1;
    let left = 0;
    /** viewport px per layout px (the dock compacts with `scale` on short screens) */
    let ratio = 1;
    let raf = 0;
    let last = 0;
    const gain = DOCK_MAX / DOCK_ICON - 1;

    const measure = () => {
      // offsetLeft ignores transforms: these are the resting positions
      centers = items.map((el) => el.offsetLeft + el.offsetWidth / 2);
      plateW = Math.max(1, plate.offsetWidth);
      const box = list.getBoundingClientRect();
      left = box.left;
      ratio = list.offsetWidth > 0 ? box.width / list.offsetWidth || 1 : 1;
    };

    const render = () => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const s = scalable[i] ? gain * k.x * falloff(Math.abs(px.x - centers[i])) : 0;
        extra[i] = s * DOCK_ICON;
        total += extra[i];
      }
      let before = 0;
      for (let i = 0; i < n; i++) {
        const after = total - before - extra[i];
        const dx = (before - after) / 2;
        items[i].style.transform = dx ? `translate3d(${dx.toFixed(2)}px,0,0)` : "";
        const grow = extra[i];
        const lift = (grow / (DOCK_MAX - DOCK_ICON)) * LIFT;
        const icon = icons[i];
        if (icon) {
          icon.style.transform = grow
            ? `translate3d(0,${(-lift).toFixed(2)}px,0) scale(${(1 + grow / DOCK_ICON).toFixed(4)})`
            : "";
        }
        const tip = tips[i];
        if (tip) tip.style.translate = grow ? `0 ${(-(grow + lift)).toFixed(2)}px` : "";
        before += extra[i];
      }
      plate.style.transform = total ? `scaleX(${((plateW + total) / plateW).toFixed(4)})` : "";
    };

    const tick = (now: number) => {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      step(px, dt);
      step(k, dt);
      if (settled(px, 0.05) && settled(k, 0.0008)) {
        px.x = px.to;
        px.v = 0;
        k.x = k.to;
        k.v = 0;
        render();
        raf = 0;
        return;
      }
      render();
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const isFine = (e: PointerEvent) => e.pointerType === "mouse" || e.pointerType === "pen";

    const onEnter = (e: PointerEvent) => {
      if (!isFine(e)) return;
      measure();
      const x = (e.clientX - left) / ratio;
      // arriving from rest: start under the pointer instead of sweeping in
      if (k.x < 0.02) {
        px.x = x;
        px.v = 0;
      }
      px.to = x;
      k.to = 1;
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!isFine(e)) return;
      if (k.to === 0) return onEnter(e);
      px.to = (e.clientX - left) / ratio;
      kick();
    };
    const onLeave = () => {
      k.to = 0;
      kick();
    };
    const onResize = () => {
      if (k.to) measure();
    };

    zone.addEventListener("pointerenter", onEnter);
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    return () => {
      zone.removeEventListener("pointerenter", onEnter);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      clear();
    };
  }, [enabled, zoneRef, listRef, plateRef]);
}
