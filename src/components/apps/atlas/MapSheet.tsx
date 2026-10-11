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

/** layout offset of `el` inside `root` (transforms ignored) */
function offsetIn(el: HTMLElement, root: HTMLElement) {
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? y : NaN;
}

/** How far a mini player resting in a bottom corner reaches up into the
    clip (0 when there is none, or it sits up top). Reads what the shell
    publishes: html[data-pip-corner] and --os-pip-bottom. */
function pipReach(clip: HTMLElement) {
  const root = document.documentElement;
  const corner = root.dataset.pipCorner;
  if (corner !== "bl" && corner !== "br") return 0;
  const bottom = parseFloat(getComputedStyle(root).getPropertyValue("--os-pip-bottom"));
  if (!bottom) return 0;
  // the pill is 3.25rem; the shell does not publish its height (yet)
  const h = document.querySelector<HTMLElement>(".os-pip")?.offsetHeight || 52;
  return Math.max(0, clip.getBoundingClientRect().bottom - (bottom - h));
}

export type SheetMetrics = {
  /** sheet translateY at each detent (full is 0) */
  peekY: MotionValue<number>;
  halfY: MotionValue<number>;
  /** the height above the sheet, in stage px, that the globe fits into
      at half (0: the sheet covers none of it) */
  room: MotionValue<number>;
};

/**
 * Apple Maps-style sheet over the globe with three detents: peek (the
 * place's name), half (its card down to the note) and full (everything:
 * details, places, stats, postcards). Drag anywhere on it, 1:1 from the
 * touch-down point, rubber-banded past full and peek; on release the
 * velocity is projected to pick a detent (a real flick always moves at
 * least one detent its way) and the spring takes over with that velocity.
 * It is interruptible: a finger landing on it mid-flight catches it.
 * Only once it has settled at full does the content scroll natively;
 * pulling down from its top then hands the gesture back to the sheet.
 * Tap or arrow keys on the grabber step through detents; Esc collapses
 * from full while focus is inside it. A mini player resting in a bottom
 * corner is kept clear of the half detent's content and of the end of
 * the scroll. `beside` (landscape tablets): it floats next to the globe,
 * covers nothing, and so rests fully open like an iPad sidebar.
 * Reduced motion: it snaps.
 */
export function MapSheet({
  y,
  metrics,
  place,
  beside = false,
  onDetent,
  card,
  children,
}: {
  y: MotionValue<number>;
  metrics: SheetMetrics;
  place: Place;
  /** the sheet sits beside the globe instead of over its lower part */
  beside?: boolean;
  onDetent: (d: Detent) => void;
  /** the place card: the half detent is sized from it */
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
  /** resting at full: only then may the content take touches natively */
  const settledRef = useRef(false);
  const entered = useRef(false);
  /** the reader moved the sheet themselves: stop choosing for them */
  const touched = useRef(false);
  const grab = useRef<{
    id: number;
    sx: number;
    sy: number;
    y0: number;
    on: boolean;
    /** it was moving when the finger landed */
    caught: boolean;
    samples: Sample[];
  } | null>(null);
  const dragged = useRef(false);
  /** where the running spring is headed */
  const target = useRef(0);

  const yFor = useCallback(
    (d: Detent) => (d === "full" ? 0 : d === "half" ? metrics.halfY.get() : metrics.peekY.get()),
    [metrics]
  );

  /** 1:1 inside the detents, resisting past them: past full it gives a
      few points (the clip leaves it room; the content is what scrolls
      there), below peek a little more, never enough to sink the name */
  const band = useCallback(
    (v: number) => {
      const max = metrics.peekY.get();
      if (v < 0) return -rubberband(-v, 20);
      if (v > max) return max + rubberband(v - max, 64);
      return v;
    },
    [metrics]
  );

  const setSettled = useCallback((on: boolean) => {
    settledRef.current = on;
    const el = sheetRef.current;
    if (!el) return;
    if (on) el.setAttribute("data-settled", "");
    else el.removeAttribute("data-settled");
  }, []);

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
      setSettled(false);
      if (d !== "full") scrollRef.current?.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      if (changed && !silent) blip("tick");
      target.current = yFor(d);
      if (reduced) {
        y.jump(target.current);
        setSettled(d === "full");
        return;
      }
      animate(y, target.current, {
        ...(Math.abs(v) > 900 ? spring.flick : spring.default),
        velocity: v,
        onComplete: () => {
          if (detentRef.current === d && !grab.current) setSettled(d === "full");
        },
      });
    },
    [blip, reduced, setDetent, setSettled, y, yFor]
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

  // geometry: detents from the sheet's height and its card, and the room
  // the globe keeps above it at half
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const cardEl = cardRef.current;
    if (!sheet || !cardEl) return;
    const clip = sheet.parentElement as HTMLElement;
    const measure = () => {
      const H = sheet.offsetHeight;
      const css = getComputedStyle(sheet);
      const peek = parseFloat(css.getPropertyValue("--app-atlas-peek")) || 136;
      // half shows the card down to its note; a mini player resting in a
      // bottom corner floats over the sheet's foot, so half rises until
      // the note clears it
      const anchor = cardEl.querySelector<HTMLElement>("[data-sheet-half]");
      const at = anchor ? offsetIn(anchor, sheet) + anchor.offsetHeight : NaN;
      const end = Number.isFinite(at) ? at : offsetIn(cardEl, sheet) + cardEl.offsetHeight;
      const reach = beside ? 0 : pipReach(clip);
      const half = Math.round(Math.max(peek + 160, Math.min(H * 0.68, end + 14 + Math.max(0, reach - 4))));
      metrics.peekY.set(Math.max(0, H - peek));
      metrics.halfY.set(Math.max(0, H - half));
      // tablets: the sheet floats beside the globe, nothing to dodge
      metrics.room.set(beside ? 0 : Math.max(96, clip.offsetTop + (H - half) - 12));
      if (!entered.current) {
        entered.current = true;
        if (reduced) {
          y.jump(yFor(detentRef.current));
          setSettled(detentRef.current === "full");
        } else {
          // rise in from below, the same path it would leave by
          y.jump(H + 24);
          target.current = yFor(detentRef.current);
          animate(y, target.current, {
            ...spring.gentle,
            delay: 0.15,
            onComplete: () => {
              if (!grab.current) setSettled(detentRef.current === "full");
            },
          });
        }
      } else if (!grab.current) {
        const to = yFor(detentRef.current);
        if (!y.isAnimating()) {
          y.jump(to);
          setSettled(detentRef.current === "full");
        } else if (Math.abs(target.current - to) > 1) {
          // the card reflowed mid-flight (a new name wrapping): retarget,
          // keeping the spring's velocity
          const d = detentRef.current;
          target.current = to;
          animate(y, to, {
            ...spring.default,
            velocity: y.getVelocity(),
            onComplete: () => {
              if (detentRef.current === d && !grab.current) setSettled(d === "full");
            },
          });
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    ro.observe(cardEl);
    // the mini player moved corners, mounted or changed size
    const mo = new MutationObserver(measure);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pip-corner", "style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [beside, metrics, reduced, setSettled, y, yFor]);

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

  // Esc collapses from full, but only when it is the sheet being
  // dismissed: not when Esc already closed Spotlight, a dialog or the
  // Terminal, and not with focus elsewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || detentRef.current !== "full" || beside) return;
      if (!sheetRef.current?.contains(document.activeElement) || document.querySelector("dialog[open]")) return;
      touched.current = true;
      goTo("half");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beside, goTo]);

  // touch at full: the content scrolls natively; pulling down from its top
  // hands the gesture to the sheet (decided on the first move)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let th: { sy: number; y0: number; decided: boolean; on: boolean; samples: Sample[] } | null = null;
    const start = (e: TouchEvent) => {
      // moving (or not at full): the pointer handlers own the touch
      if (!settledRef.current || e.touches.length !== 1) {
        th = null;
        return;
      }
      th = { sy: e.touches[0].clientY, y0: 0, decided: false, on: false, samples: [{ t: e.timeStamp, y: e.touches[0].clientY }] };
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
          y.stop();
          th.y0 = y.get();
          setSettled(false);
          sheetRef.current?.setAttribute("data-grabbing", "");
        }
      }
      if (!th.on) return;
      if (e.cancelable) e.preventDefault();
      // 1:1 from where the finger first landed
      y.set(band(th.y0 + (cy - th.sy)));
      th.samples.push({ t: e.timeStamp, y: cy });
      if (th.samples.length > 12) th.samples.shift();
    };
    const end = (e: TouchEvent) => {
      if (th?.on) {
        sheetRef.current?.removeAttribute("data-grabbing");
        release(reduced ? 0 : velocity(th.samples, e.timeStamp));
      }
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
  }, [band, reduced, release, setSettled, y]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    // touch on the content of a sheet resting at full belongs to native
    // scrolling (and the handoff above); while it moves, it is ours
    if (e.pointerType === "touch" && settledRef.current && scrollRef.current?.contains(target)) return;
    if (target.closest("input,textarea,select")) return;
    // respond on touch-down: a sheet in flight stops under the finger
    const caught = y.isAnimating();
    y.stop();
    dragged.current = false;
    grab.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, y0: y.get(), on: false, caught, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.on) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        grab.current = null; // sideways: the postcards' gesture
        if (g.caught) release(0);
        return;
      }
      if (Math.abs(dy) < 6) return;
      g.on = true;
      dragged.current = true;
      setSettled(false);
      sheetRef.current?.setPointerCapture(e.pointerId);
      sheetRef.current?.setAttribute("data-grabbing", "");
    }
    // 1:1 from the touch-down point (the slop is caught up at once)
    y.set(band(g.y0 + dy));
    g.samples.push({ t: e.timeStamp, y: e.clientY });
    if (g.samples.length > 12) g.samples.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = grab.current;
    grab.current = null;
    sheetRef.current?.removeAttribute("data-grabbing");
    if (!g) return;
    if (!g.on) {
      // a tap that stopped it mid-flight: settle to the nearest detent
      if (g.caught) release(0);
      return;
    }
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
          <div ref={cardRef}>{card}</div>
          {children}
        </div>
      </m.div>
    </div>
  );
}
