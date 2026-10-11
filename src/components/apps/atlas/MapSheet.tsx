"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, m, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { nearest, project, rubberband, spring } from "@/lib/motion";
import { useReduced } from "@/hooks/env";
import { Glass } from "@/components/os/Glass";
import type { Place } from "@/lib/places";

export type Detent = "peek" | "half" | "full";

type Sample = { t: number; y: number };

function velocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 60) return 0;
  let first = last;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t > 80) break;
    first = samples[i];
  }
  const dt = Math.max(8, last.t - first.t);
  return ((last.y - first.y) / dt) * 1000;
}

const band = (v: number, min: number, max: number, dim: number) =>
  v < min ? min - rubberband(min - v, dim) : v > max ? max + rubberband(v - max, dim) : v;

export type SheetMetrics = {
  /** sheet translateY at each detent (full is 0) */
  peekY: MotionValue<number>;
  halfY: MotionValue<number>;
  /** how far the globe rises, and how much it shrinks, at half */
  shift: MotionValue<number>;
  shrink: MotionValue<number>;
};

/**
 * Apple Maps-style sheet over the globe with three detents: peek (the
 * place's name), half (its card) and full (everything: places, stats,
 * postcards). Drag anywhere on it, 1:1 from the grab point, rubber-banded
 * past full and peek; on release the velocity is projected to pick a
 * detent (a real flick always moves at least one detent its way) and the
 * spring takes over with that velocity. At full the content scrolls; pull
 * down from its top and the sheet takes the gesture back. Tap or arrow
 * keys on the grabber step through detents; Esc collapses from full.
 * `beside` (landscape tablets): it floats next to the globe, covers
 * nothing, and so rests fully open like an iPad sidebar.
 * Reduced motion: it snaps.
 */
export function MapSheet({
  y,
  metrics,
  place,
  globeRef,
  beside = false,
  onDetent,
  head,
  card,
  children,
}: {
  y: MotionValue<number>;
  metrics: SheetMetrics;
  place: Place;
  globeRef: React.RefObject<HTMLElement | null>;
  /** the sheet sits beside the globe instead of over its lower part */
  beside?: boolean;
  onDetent: (d: Detent) => void;
  /** measured to size the half detent: the card */
  head?: React.ReactNode;
  card: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const a = t.atlas.sheet;
  const { blip } = useSound();
  const reduced = useReduced();
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // where it rests by default, and where a new place opens it
  const rest: Detent = beside ? "full" : "peek";
  const open: Detent = beside ? "full" : "half";
  const [detent, setDetentState] = useState<Detent>(rest);
  const detentRef = useRef<Detent>(rest);
  const entered = useRef(false);
  /** the reader moved the sheet themselves: stop choosing for them */
  const touched = useRef(false);
  const grab = useRef<{ id: number; sx: number; sy: number; y0: number; on: boolean; samples: Sample[] } | null>(null);
  const dragged = useRef(false);

  const yFor = useCallback(
    (d: Detent) => (d === "full" ? 0 : d === "half" ? metrics.halfY.get() : metrics.peekY.get()),
    [metrics]
  );

  const setDetent = useCallback(
    (d: Detent) => {
      detentRef.current = d;
      setDetentState(d);
      onDetent(d);
    },
    [onDetent]
  );

  const goTo = useCallback(
    (d: Detent, v = 0, silent = false) => {
      const changed = d !== detentRef.current;
      setDetent(d);
      if (d !== "full") scrollRef.current?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      if (changed && !silent) blip("tick");
      if (reduced) {
        y.jump(yFor(d));
        return;
      }
      animate(y, yFor(d), { ...(Math.abs(v) > 900 ? spring.flick : spring.default), velocity: v });
    },
    [blip, reduced, setDetent, y, yFor]
  );

  const release = useCallback(
    (v: number) => {
      const pts = [0, metrics.halfY.get(), metrics.peekY.get()];
      const cur = y.get();
      let to = nearest(cur + project(v, 0.995), pts);
      if (Math.abs(v) > 500) {
        const dir = Math.sign(v);
        const ahead = pts.filter((p) => (dir > 0 ? p > cur + 1 : p < cur - 1)).sort((p, q) => (dir > 0 ? p - q : q - p));
        if ((dir > 0 && to <= cur) || (dir < 0 && to >= cur)) to = ahead[0] ?? to;
      }
      const d: Detent = to === 0 ? "full" : to === metrics.halfY.get() ? "half" : "peek";
      touched.current = true;
      goTo(d, v);
    },
    [goTo, metrics, y]
  );

  // geometry: detents from the sheet's height and its content, and the
  // globe's lift so it stays centred above the sheet at half
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const cardEl = cardRef.current;
    if (!sheet || !cardEl) return;
    const measure = () => {
      const H = sheet.offsetHeight;
      const css = getComputedStyle(sheet);
      const peek = parseFloat(css.getPropertyValue("--app-atlas-peek")) || 116;
      const cardBottom = cardEl.offsetTop + cardEl.offsetHeight + 14;
      const half = Math.max(peek + 160, Math.min(H * 0.62, cardBottom));
      metrics.peekY.set(Math.max(0, H - peek));
      metrics.halfY.set(Math.max(0, H - half));
      const globe = globeRef.current;
      if (globe) {
        const gh = globe.offsetHeight;
        const gw = globe.offsetWidth;
        const clip = sheet.parentElement as HTMLElement;
        const beside = clip.offsetLeft + clip.offsetWidth <= globe.offsetLeft + 1;
        const top = clip.offsetTop + (H - half) - 12; // sheet top at half, in stage px
        const avail = Math.max(80, top);
        // tablets: the sheet floats beside the globe, nothing to dodge
        metrics.shift.set(beside ? 0 : Math.max(0, gh / 2 - avail / 2));
        metrics.shrink.set(beside ? 0 : Math.max(0, 1 - Math.min(1, avail / Math.min(gw, gh))));
      }
      if (!entered.current) {
        entered.current = true;
        if (reduced) y.jump(yFor(detentRef.current));
        else {
          // rise in from below, the same path it would leave by
          y.jump(H + 24);
          animate(y, yFor(detentRef.current), { ...spring.gentle, delay: 0.15 });
        }
      } else if (!grab.current && !y.isAnimating()) y.jump(yFor(detentRef.current));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    ro.observe(cardEl);
    if (globeRef.current) ro.observe(globeRef.current);
    return () => ro.disconnect();
  }, [globeRef, metrics, reduced, y, yFor]);

  // a new place: show its card
  const shownPlace = useRef(place.id);
  useEffect(() => {
    if (shownPlace.current === place.id) return;
    shownPlace.current = place.id;
    if (detentRef.current !== open) goTo(open);
    else scrollRef.current?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, [place.id, goTo, open, reduced]);

  // the layout changed under it (a tablet rotated): rest where the new
  // layout rests, unless the reader has already placed it
  useEffect(() => {
    if (!entered.current || touched.current || detentRef.current === rest) return;
    goTo(rest, 0, true);
  }, [rest, goTo]);

  // Esc collapses from full
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && detentRef.current === "full") goTo("half");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // touch at full: the content scrolls natively; pulling down from its top
  // hands the gesture to the sheet (decided on the first move)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let th: { sy: number; y0: number; decided: boolean; on: boolean; samples: Sample[] } | null = null;
    const start = (e: TouchEvent) => {
      if (detentRef.current !== "full" || e.touches.length !== 1) {
        th = null;
        return;
      }
      th = { sy: e.touches[0].clientY, y0: y.get(), decided: false, on: false, samples: [] };
    };
    const move = (e: TouchEvent) => {
      if (!th) return;
      const cy = e.touches[0].clientY;
      const dy = cy - th.sy;
      if (!th.decided) {
        if (Math.abs(dy) < 4) return;
        th.decided = true;
        th.on = dy > 0 && el.scrollTop <= 0 && !(e.target as Element).closest("[data-atlas-hscroll]");
        if (th.on) {
          th.sy = cy;
          y.stop();
        }
      }
      if (!th.on) return;
      if (e.cancelable) e.preventDefault();
      y.set(band(th.y0 + (cy - th.sy), 0, metrics.peekY.get(), sheetRef.current?.offsetHeight ?? 600));
      th.samples.push({ t: e.timeStamp, y: cy });
      if (th.samples.length > 12) th.samples.shift();
    };
    const end = (e: TouchEvent) => {
      if (th?.on) release(reduced ? 0 : velocity(th.samples, e.timeStamp));
      th = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [metrics, reduced, release, y]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const inScroll = scrollRef.current?.contains(target);
    // touch at full belongs to native scrolling (and the handoff above)
    if (e.pointerType === "touch" && inScroll && detentRef.current === "full") return;
    if (target.closest("input,textarea,select")) return;
    y.stop();
    dragged.current = false;
    grab.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, y0: y.get(), on: false, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.on) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        grab.current = null; // sideways: the postcards' gesture
        return;
      }
      if (Math.abs(dy) < 6) return;
      g.on = true;
      dragged.current = true;
      g.sy = e.clientY;
      sheetRef.current?.setPointerCapture(e.pointerId);
      sheetRef.current?.setAttribute("data-grabbing", "");
    }
    y.set(band(g.y0 + (e.clientY - g.sy), 0, metrics.peekY.get(), sheetRef.current?.offsetHeight ?? 600));
    g.samples.push({ t: e.timeStamp, y: e.clientY });
    if (g.samples.length > 12) g.samples.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = grab.current;
    grab.current = null;
    sheetRef.current?.removeAttribute("data-grabbing");
    if (!g || !g.on) return;
    release(reduced ? 0 : velocity(g.samples, e.timeStamp));
  };

  const cycle = () => {
    touched.current = true;
    goTo(detent === "peek" ? "half" : detent === "half" ? "full" : "peek");
  };
  const onGrabKey = (e: React.KeyboardEvent) => {
    const order: Detent[] = ["peek", "half", "full"];
    const i = order.indexOf(detent);
    if (e.key === "ArrowUp" && i < 2) {
      e.preventDefault();
      touched.current = true;
      goTo(order[i + 1]);
    } else if (e.key === "ArrowDown" && i > 0) {
      e.preventDefault();
      touched.current = true;
      goTo(order[i - 1]);
    }
  };

  return (
    <div className="app-atlas-sheet-clip">
    <m.div
      ref={sheetRef}
      className="app-atlas-sheet"
      data-detent={detent}
      role="region"
      aria-label={a.label}
      style={{ y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (dragged.current) {
          e.preventDefault();
          e.stopPropagation();
          dragged.current = false;
        }
      }}
      onFocus={(e) => {
        // tabbing into content below the fold opens the sheet up
        const el = e.target as HTMLElement;
        const sheet = sheetRef.current;
        if (!sheet || detentRef.current === "full" || el.classList.contains("app-atlas-sheet-grab")) return;
        const visibleBottom = sheet.getBoundingClientRect().top + (sheet.offsetHeight - yFor(detentRef.current));
        if (el.getBoundingClientRect().bottom > visibleBottom - 4) goTo("full");
      }}
    >
      <Glass thickness="thick" refract={false} className="app-atlas-sheet-glass" aria-hidden />
      <button
        type="button"
        className="app-atlas-sheet-grab"
        onClick={cycle}
        onKeyDown={onGrabKey}
        aria-label={`${a.grabber} (${a[detent]})`}
        aria-expanded={detent !== "peek"}
      >
        <span className="app-atlas-sheet-grabber" aria-hidden />
      </button>
      <div ref={scrollRef} className="app-atlas-sheet-scroll" data-lenis-prevent>
        {head}
        <div ref={cardRef}>{card}</div>
        {children}
      </div>
    </m.div>
    </div>
  );
}
