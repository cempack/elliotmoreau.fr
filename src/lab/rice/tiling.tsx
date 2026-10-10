"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, m, useMotionValue } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { PixelGlyph, type Cells } from "@/components/glyphs";
import { useMedia, useReduced } from "./hooks";
import { useRiceCopy } from "./strings";

export type Rect = { x: number; y: number; w: number; h: number };

/** Desktop-wide state: which window holds focus (the active border). */
type Desk = { focused: string; setFocused: (id: string) => void; resetEpoch: number };
export const DeskContext = createContext<Desk>({ focused: "", setFocused: () => {}, resetEpoch: 0 });

export type WinSpec = {
  id: string;
  /** grid-area this window tiles into by default (CSS owns the layout) */
  slot: string;
  title: string;
  icon?: Cells;
  bodyClass?: string;
  /** holds HeroNameFx: replay the etch after its size changes */
  hero?: boolean;
  children: React.ReactNode;
};

type Layout = { rects: Record<string, Rect>; W: number; H: number; epoch: number };
type Dir = "left" | "right" | "up" | "down";

type Api = {
  focus: (id: string) => void;
  dragStart: (id: string) => void;
  dragOver: (id: string, cx: number, cy: number) => void;
  drop: (id: string, cx: number, cy: number) => Rect;
  toggleMax: (id: string) => void;
  restore: (id: string) => void;
  moveFocus: (id: string, dir: Dir) => void;
  register: (id: string, el: HTMLElement | null) => void;
  boxTop: () => number;
  placer: (id: string, place: ((r: Rect) => void) | null) => void;
};

const same = (a: Rect | null, b: Rect | null) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** progressive resistance outside [min, max] — real things slow before they stop */
function band(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim);
  if (v > max) return max + rubberband(v - max, dim);
  return v;
}

const replayHero = () =>
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("em:replay")), 460);

/**
 * A Hyprland-style workspace. CSS grid template areas define the tiling
 * slots per breakpoint (so SSR paints the final layout); once mounted on a
 * wide screen, invisible slot placeholders are measured and the windows
 * switch to absolutely positioned motion values sitting exactly on them.
 * From there windows can be thrown between slots, swapped, maximized.
 * At ≤768px it stays a plain stacked grid (no dragging).
 */
export function Tiles({
  windows,
  extras,
  className = "",
}: {
  windows: WinSpec[];
  extras?: React.ReactNode;
  className?: string;
}) {
  const canTile = useMedia("(min-width: 769px)");
  const reduced = useReduced();
  const { blip } = useSound();
  const { focused, setFocused, resetEpoch } = useContext(DeskContext);
  const boxRef = useRef<HTMLDivElement>(null);
  const slotEls = useRef(new Map<string, HTMLDivElement>());
  const winEls = useRef(new Map<string, HTMLElement>());

  const defaults = useMemo(() => Object.fromEntries(windows.map((w) => [w.id, w.slot])), [windows]);
  const [assign, setAssign] = useState<Record<string, string>>(defaults);
  const [maxed, setMaxed] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>(() => windows.map((w) => w.id));
  const [layout, setLayout] = useState<Layout | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);

  // "reset layout" from the launcher: adjust state while rendering
  const [seenReset, setSeenReset] = useState(resetEpoch);
  if (seenReset !== resetEpoch) {
    setSeenReset(resetEpoch);
    setAssign(defaults);
    setMaxed(null);
  }

  // the latest assignment, for the measuring callback (never read in render)
  const live = useRef({ assign, maxed });
  useEffect(() => {
    live.current = { assign, maxed };
  });
  const placers = useRef(new Map<string, (r: Rect) => void>());
  const placer = useCallback((id: string, place: ((r: Rect) => void) | null) => {
    if (place) placers.current.set(id, place);
    else placers.current.delete(id);
  }, []);

  useEffect(() => {
    if (!canTile) return;
    const box = boxRef.current;
    if (!box) return;
    let epoch = 0;
    const measure = () => {
      const rects: Record<string, Rect> = {};
      for (const [slot, el] of slotEls.current) {
        rects[slot] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      }
      const W = box.clientWidth;
      const H = box.clientHeight;
      // seat every window on its rect BEFORE React swaps them to absolute
      // positioning, so no frame ever shows a window at 0×0 (HeroNameFx
      // would size its canvas from that frame)
      const { assign: a, maxed: mx } = live.current;
      for (const [id, place] of placers.current) {
        const r = mx === id ? { x: 0, y: 0, w: W, h: H } : rects[a[id]];
        if (r) place(r);
      }
      setLayout({ rects, W, H, epoch: ++epoch });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [canTile]);

  const tiling = canTile && !!layout;
  const heroId = windows.find((w) => w.hero)?.id;
  const full: Rect | null = layout ? { x: 0, y: 0, w: layout.W, h: layout.H } : null;
  const rectFor = (id: string, a = assign, mx = maxed) =>
    layout ? (mx === id ? full : layout.rects[a[id]] ?? null) : null;

  const slotAt = (cx: number, cy: number) => {
    const box = boxRef.current;
    if (!box || !layout) return null;
    const r = box.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    let best: string | null = null;
    let bestD = Infinity;
    for (const [slot, rc] of Object.entries(layout.rects)) {
      if (px >= rc.x && px <= rc.x + rc.w && py >= rc.y && py <= rc.y + rc.h) return slot;
      const d = Math.hypot(px - (rc.x + rc.w / 2), py - (rc.y + rc.h / 2));
      if (d < bestD) {
        bestD = d;
        best = slot;
      }
    }
    return best;
  };

  const raise = (id: string) => setStack((s) => (s[s.length - 1] === id ? s : [...s.filter((x) => x !== id), id]));

  const api: Api = {
    focus: (id) => {
      setFocused(id);
      raise(id);
    },
    dragStart: (id) => {
      setDrag({ id, over: maxed === id ? null : assign[id] });
    },
    dragOver: (id, cx, cy) => {
      if (maxed === id) return;
      const over = slotAt(cx, cy);
      setDrag((d) => (d && d.id === id && d.over === over ? d : { id, over }));
    },
    drop: (id, cx, cy) => {
      setDrag(null);
      if (maxed === id || !layout) return rectFor(id) ?? { x: 0, y: 0, w: 0, h: 0 };
      const target = slotAt(cx, cy) ?? assign[id];
      const from = assign[id];
      if (target === from) return layout.rects[from];
      const other = Object.keys(assign).find((k) => assign[k] === target);
      const next = { ...assign, [id]: target };
      if (other) next[other] = from;
      setAssign(next);
      blip("select");
      if (heroId && (heroId === id || heroId === other)) replayHero();
      return layout.rects[target];
    },
    toggleMax: (id) => {
      if (!tiling) return;
      const on = maxed !== id;
      setMaxed(on ? id : null);
      setFocused(id);
      raise(id);
      blip(on ? "open" : "close");
      if (heroId && (heroId === id || heroId === maxed)) replayHero();
    },
    restore: (id) => {
      if (maxed !== id) return;
      setMaxed(null);
      blip("close");
      if (heroId === id) replayHero();
    },
    moveFocus: (id, dir) => {
      const from = winEls.current.get(id)?.getBoundingClientRect();
      if (!from) return;
      const fx = from.left + from.width / 2;
      const fy = from.top + from.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const [other, el] of winEls.current) {
        if (other === id) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - fx;
        const dy = r.top + r.height / 2 - fy;
        const primary = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
        if (primary <= 4) continue;
        const secondary = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 2;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      best?.focus({ preventScroll: tiling });
    },
    register: (id, el) => {
      if (el) winEls.current.set(id, el);
      else winEls.current.delete(id);
    },
    placer,
    boxTop: () => boxRef.current?.getBoundingClientRect().top ?? 0,
  };

  const dropRect =
    tiling && drag && drag.over && drag.over !== assign[drag.id] ? layout!.rects[drag.over] : null;

  return (
    <div ref={boxRef} className={`rice-tiles ${className}`} data-tiling={tiling || undefined}>
      {windows.map((w) => (
        <div
          key={`slot-${w.slot}`}
          aria-hidden
          className="rice-slot"
          style={{ gridArea: w.slot }}
          ref={(el) => {
            if (el) slotEls.current.set(w.slot, el);
            else slotEls.current.delete(w.slot);
          }}
        />
      ))}
      {extras}
      <AnimatePresence>
        {dropRect && (
          <m.div
            key="drop"
            aria-hidden
            className="rice-drop"
            initial={{ opacity: 0, x: dropRect.x, y: dropRect.y, width: dropRect.w, height: dropRect.h, scale: 0.97 }}
            animate={{ opacity: 1, x: dropRect.x, y: dropRect.y, width: dropRect.w, height: dropRect.h, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={spring.snappy}
          />
        )}
      </AnimatePresence>
      {windows.map((w, i) => (
        <Window
          key={w.id}
          spec={w}
          index={i}
          target={tiling ? rectFor(w.id) : null}
          epoch={layout?.epoch ?? 0}
          bounds={layout ? { W: layout.W, H: layout.H } : { W: 0, H: 0 }}
          tiling={tiling}
          maxed={maxed === w.id}
          focused={focused === w.id}
          dragging={drag?.id === w.id}
          z={10 + stack.indexOf(w.id)}
          reduced={reduced}
          api={api}
        />
      ))}
    </div>
  );
}

type Grab = {
  pid: number;
  top0: number;
  sx: number;
  sy: number;
  x0: number;
  y0: number;
  moved: boolean;
  samples: { t: number; x: number; y: number }[];
};

function Window({
  spec,
  index,
  target,
  epoch,
  bounds,
  tiling,
  maxed,
  focused,
  dragging,
  z,
  reduced,
  api,
}: {
  spec: WinSpec;
  index: number;
  target: Rect | null;
  epoch: number;
  bounds: { W: number; H: number };
  tiling: boolean;
  maxed: boolean;
  focused: boolean;
  dragging: boolean;
  z: number;
  reduced: boolean;
  api: Api;
}) {
  const { r, drag: dragLabel } = useRiceCopy();
  const titleId = useId();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const grab = useRef<Grab | null>(null);
  const draggingRef = useRef(false);
  const aimed = useRef<Rect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const geomRef = useRef<HTMLSpanElement | null>(null);
  const placedEpoch = useRef(-1);
  const [pressed, setPressed] = useState(false);

  // Geometry is written straight to the DOM from the motion values (not
  // bound through `style`: under LazyMotion the element's VisualElement is
  // created late and would reset bound values to their first-render 0).
  // CSS ignores these inline values whenever the grid is in charge.
  useEffect(() => {
    const apply = () => {
      const el = elRef.current;
      if (el) {
        el.style.transform = `translate3d(${x.get()}px, ${y.get()}px, 0)`;
        el.style.width = `${w.get()}px`;
        el.style.height = `${h.get()}px`;
      }
      const g = geomRef.current;
      if (g) g.textContent = `${Math.max(1, Math.round(w.get() / 8.4))}×${Math.max(1, Math.round(h.get() / 19))}`;
    };
    const offs = [x, y, w, h].map((v) => v.on("change", apply));
    apply();
    return () => offs.forEach((off) => off());
  }, [x, y, w, h]);

  const { placer } = api;
  useEffect(() => {
    placer(spec.id, (r) => {
      // a window in hand stays in hand; it springs to the new rect on drop
      if (draggingRef.current) return;
      // jumps notify synchronously, so the DOM is seated before React
      // flips the tiles to absolute positioning
      x.jump(r.x);
      y.jump(r.y);
      w.jump(r.w);
      h.jump(r.h);
      aimed.current = r;
    });
    return () => placer(spec.id, null);
  }, [placer, spec.id, x, y, w, h]);

  // follow the target rect: jump on first placement / viewport resize,
  // spring on swaps and maximize (interruptible: motion values retarget)
  useLayoutEffect(() => {
    if (!tiling || !target) {
      placedEpoch.current = -1;
      aimed.current = null;
      return;
    }
    if (draggingRef.current) return;
    const fresh = placedEpoch.current !== epoch;
    placedEpoch.current = epoch;
    if (same(aimed.current, target)) return;
    aimed.current = target;
    if (fresh || reduced) {
      x.jump(target.x);
      y.jump(target.y);
      w.jump(target.w);
      h.jump(target.h);
      return;
    }
    animate(x, target.x, spring.default);
    animate(y, target.y, spring.default);
    animate(w, target.w, spring.default);
    animate(h, target.h, spring.default);
  }, [tiling, target, epoch, reduced, x, y, w, h]);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!tiling || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,a,input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    x.stop();
    y.stop();
    grab.current = {
      pid: e.pointerId,
      top0: api.boxTop(),
      sx: e.clientX,
      sy: e.clientY,
      x0: x.get(),
      y0: y.get(),
      moved: false,
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
    setPressed(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      g.moved = true;
      draggingRef.current = true;
      api.dragStart(spec.id);
    }
    g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 90) g.samples.shift();
    // 1:1 with the grab offset (and any scroll since the grab, so the
    // page never has to be locked); rubber-band past the screen edges
    const scrolled = g.top0 - api.boxTop();
    x.set(band(g.x0 + dx, 0, Math.max(0, bounds.W - w.get()), bounds.W));
    y.set(band(g.y0 + dy + scrolled, 0, Math.max(0, bounds.H - h.get()), bounds.H));
    api.dragOver(spec.id, e.clientX, e.clientY);
  };

  const end = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const g = grab.current;
    if (!g || g.pid !== e.pointerId) return;
    grab.current = null;
    setPressed(false);
    if (!g.moved) return;
    draggingRef.current = false;
    const first = g.samples[0];
    const last = g.samples[g.samples.length - 1];
    const dt = Math.max(8, last.t - first.t);
    const stale = cancelled || e.timeStamp - last.t > 70;
    const vx = stale ? 0 : ((last.x - first.x) / dt) * 1000;
    const vy = stale ? 0 : ((last.y - first.y) / dt) * 1000;
    // where the throw would come to rest picks the slot, not where it let go
    const rect = api.drop(spec.id, e.clientX + project(vx, 0.995), e.clientY + project(vy, 0.995));
    aimed.current = rect;
    if (reduced) {
      x.jump(rect.x);
      y.jump(rect.y);
      w.jump(rect.w);
      h.jump(rect.h);
      return;
    }
    const flung = Math.hypot(vx, vy) > 900;
    const t = flung ? spring.flick : spring.default;
    animate(x, rect.x, { ...t, velocity: vx });
    animate(y, rect.y, { ...t, velocity: vy });
    animate(w, rect.w, spring.default);
    animate(h, rect.h, spring.default);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    const dirs: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    if (dirs[e.key]) {
      e.preventDefault();
      api.moveFocus(spec.id, dirs[e.key]);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      api.toggleMax(spec.id);
    } else if (e.key === "Escape" && maxed) {
      api.restore(spec.id);
    } else if (e.key === "Enter") {
      const inner = e.currentTarget.querySelector<HTMLElement>(
        ".rice-win-body a[href], .rice-win-body button, .rice-win-body input"
      );
      if (inner) {
        e.preventDefault();
        inner.focus();
      }
    }
  };

  const style = {
    zIndex: dragging ? 60 : maxed ? 40 : z,
    gridArea: tiling ? undefined : spec.slot,
    "--i": index,
  } as React.CSSProperties;

  return (
    <section
      ref={(el: HTMLElement | null) => {
        elRef.current = el;
        api.register(spec.id, el);
      }}
      aria-labelledby={titleId}
      tabIndex={0}
      className={`rice-win rice-win--${spec.id}`}
      data-focused={focused || undefined}
      data-maxed={maxed || undefined}
      data-dragging={dragging || undefined}
      data-pressed={pressed || undefined}
      style={style}
      onPointerDownCapture={() => api.focus(spec.id)}
      onFocus={() => api.focus(spec.id)}
      onKeyDown={onKeyDown}
    >
      <span className="rice-win-border" aria-hidden />
      <header
        className="rice-win-bar"
        data-cursor={tiling ? dragLabel : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button")) api.toggleMax(spec.id);
        }}
      >
        {spec.icon && <PixelGlyph cells={spec.icon} size={14} className="rice-win-icon" />}
        <h3 id={titleId} className="rice-win-title">
          {spec.title}
        </h3>
        <span ref={geomRef} className="rice-win-geom" aria-hidden />
        {tiling && (
          <button
            type="button"
            className="rice-win-btn"
            data-cursor=""
            aria-pressed={maxed}
            aria-label={maxed ? r.restore : r.maximize}
            title={maxed ? r.restore : r.maximize}
            onClick={() => api.toggleMax(spec.id)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden shapeRendering="crispEdges">
              {maxed ? (
                <path d="M3.5 1.5h7v7M1.5 3.5h7v7h-7z" fill="none" stroke="currentColor" strokeWidth="1.25" />
              ) : (
                <path d="M1.5 1.5h9v9h-9z" fill="none" stroke="currentColor" strokeWidth="1.25" />
              )}
            </svg>
          </button>
        )}
      </header>
      <div className={`rice-win-body ${spec.bodyClass ?? ""}`}>{spec.children}</div>
    </section>
  );
}
