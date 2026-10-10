"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { project, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { APPS } from "@/components/os/apps";
import { markLaunch } from "@/components/os/dock/launch";
import { DESKTOP_ICONS, DesktopGlyph, type DesktopIconId } from "./icons";
import { desktopMemory, type Cell } from "./store";
import { FLING, band, intersects, pushSample, releaseVelocity, type Rect, type Sample } from "./physics";

const ICON = 60;

/* ───────────────────────────── grid geometry ─────────────────────────────
   An invisible grid anchored to the top-right of the desktop, like Finder's
   "snap to grid": columns count leftward from the right edge, rows down
   from under the menu bar. CSS places each icon from the same variables
   (--c, --r on the icon; cell size and insets on the scene), so the server
   render already has them in place. */

type Metrics = {
  W: number;
  H: number;
  cw: number;
  ch: number;
  right: number;
  top: number;
  left: number;
  cols: number;
  /** rows that fit above the dock */
  rows: number;
  /** rows for the default column, clear of a mini player in the corner */
  flowRows: number;
};

function readMetrics(scene: HTMLElement): Metrics {
  const cs = getComputedStyle(scene);
  const px = (k: string, d: number) => {
    const v = parseFloat(cs.getPropertyValue(k));
    return Number.isFinite(v) ? v : d;
  };
  const W = scene.clientWidth;
  const H = scene.clientHeight;
  const cw = px("--app-home-cell-w", 96);
  const ch = px("--app-home-cell-h", 100);
  const right = px("--app-home-grid-r", 16);
  const top = px("--app-home-grid-t", 60);
  const left = px("--app-home-grid-l", 16);
  const bottom = px("--app-home-grid-b", 96);
  const reserve = px("--app-home-grid-reserve", 132);
  const cols = Math.max(1, Math.floor((W - right - left) / cw));
  const rows = Math.max(1, Math.floor((H - top - bottom) / ch));
  const flowRows = Math.max(1, Math.min(rows, Math.floor((H - top - bottom - reserve) / ch)));
  return { W, H, cw, ch, right, top, left, cols, rows, flowRows };
}

const cellPos = (m: Metrics, c: Cell) => ({ x: m.W - m.right - (c.c + 1) * m.cw, y: m.top + c.r * m.ch });
const key = (c: Cell) => `${c.c},${c.r}`;

/** Default arrangement: column after column from the top-right. */
const flowCell = (i: number, rows: number): Cell => ({ c: Math.floor(i / rows), r: i % rows });

type Live = {
  el: HTMLElement | null;
  /** where it belongs (may still be flying there) */
  cell: Cell;
  /** where CSS puts it (offsets are relative to this) */
  base: Cell;
  ox: number;
  oy: number;
  anims: AnimationPlaybackControls[];
};

type Drag = {
  pid: number;
  id: DesktopIconId;
  sx: number;
  sy: number;
  moved: boolean;
  touch: boolean;
  ids: DesktopIconId[];
  start: Record<string, { ox: number; oy: number }>;
  samples: Sample[];
  bounds: { minDx: number; maxDx: number; minDy: number; maxDy: number };
};

export type IconsProps = {
  sceneRef: React.RefObject<HTMLElement | null>;
  selected: ReadonlySet<DesktopIconId>;
  setSelected: (s: Set<DesktopIconId>) => void;
  /** rects (scene coordinates) icons may not land on: widgets, hello.txt */
  blockers: () => Rect[];
  onReadme: () => void;
  reduced: boolean;
  fine: boolean;
};

/**
 * The desktop icons: five apps and the README.
 * - Click selects (on pointer-down, Finder-style); double-click, Enter or
 *   a tap on touch opens. Arrow keys move between icons, ⌘/Ctrl+A selects
 *   them all, Esc clears.
 * - Drag one (or the whole selection) 1:1 from the grab point, rubber-band
 *   past the desktop edges; on release the throw is projected (project())
 *   and each icon springs into the nearest free grid cell with the release
 *   velocity. Reduced motion: no projection, instant snap.
 */
export function DesktopIcons({ sceneRef, selected, setSelected, blockers, onReadme, reduced, fine }: IconsProps) {
  const { t, path } = useI18n();
  const router = useRouter();
  const { blip } = useSound();
  const hintId = useId();
  // the arrangement this mount starts from: remembered for this tab, else the default column
  const [initial] = useState(() => {
    const out = {} as Record<DesktopIconId, Cell>;
    DESKTOP_ICONS.forEach((id, i) => (out[id] = desktopMemory.cell(id) ?? flowCell(i, 6)));
    return out;
  });
  const live = useRef<Record<string, Live>>({});
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const touchTap = useRef(false);
  const [focusId, setFocusId] = useState<DesktopIconId | null>(null);

  const L = (id: DesktopIconId): Live => {
    let v = live.current[id];
    if (!v) {
      v = live.current[id] = { el: null, cell: initial[id], base: initial[id], ox: 0, oy: 0, anims: [] };
    }
    return v;
  };

  const write = (v: Live) => {
    if (!v.el) return;
    v.el.style.transform = v.ox || v.oy ? `translate3d(${v.ox.toFixed(2)}px, ${v.oy.toFixed(2)}px, 0)` : "";
  };

  const commit = (v: Live) => {
    v.base = v.cell;
    v.ox = 0;
    v.oy = 0;
    if (v.el) {
      v.el.style.setProperty("--c", String(v.cell.c));
      v.el.style.setProperty("--r", String(v.cell.r));
    }
    write(v);
  };

  /** remember the whole arrangement once a hand has touched it */
  const remember = () => {
    const cells = {} as Record<DesktopIconId, Cell>;
    for (const id of DESKTOP_ICONS) cells[id] = L(id).cell;
    desktopMemory.arrange(cells);
  };

  /** cells taken by others or covered by a widget / hello.txt */
  const occupancy = (m: Metrics, except: Set<DesktopIconId>) => {
    const taken = new Set<string>();
    for (const id of DESKTOP_ICONS) if (!except.has(id)) taken.add(key(L(id).cell));
    const rects = blockers();
    for (let c = 0; c < m.cols; c++) {
      for (let r = 0; r < m.rows; r++) {
        const p = cellPos(m, { c, r });
        // the icon's footprint inside its cell (tile + label), not the whole cell
        const box = { left: p.x + 10, top: p.y + 4, right: p.x + m.cw - 10, bottom: p.y + m.ch - 8 };
        if (rects.some((b) => intersects(box, b))) taken.add(key({ c, r }));
      }
    }
    return taken;
  };

  /** nearest free cell to a point (scene coords of the cell's top-left) */
  const nearestFree = (m: Metrics, px: number, py: number, taken: Set<string>): Cell => {
    let best: Cell = { c: 0, r: 0 };
    let bestD = Infinity;
    for (let c = 0; c < m.cols; c++) {
      for (let r = 0; r < m.rows; r++) {
        if (taken.has(key({ c, r }))) continue;
        const p = cellPos(m, { c, r });
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    return best;
  };

  /** spring an icon to its (logical) cell, carrying a velocity */
  const fly = (id: DesktopIconId, m: Metrics, vx: number, vy: number, thrown: boolean) => {
    const v = L(id);
    v.anims.forEach((a) => a.stop());
    const to = cellPos(m, v.cell);
    const from = cellPos(m, v.base);
    const tx = to.x - from.x;
    const ty = to.y - from.y;
    if (reduced) {
      commit(v);
      return;
    }
    const tr = thrown ? spring.flick : spring.default;
    let done = 0;
    const finish = () => {
      if (++done === 2) commit(v);
    };
    v.anims = [
      animate(v.ox, tx, {
        ...tr,
        velocity: vx,
        onUpdate: (n) => {
          v.ox = n;
          write(v);
        },
        onComplete: finish,
      }),
      animate(v.oy, ty, {
        ...tr,
        velocity: vy,
        onUpdate: (n) => {
          v.oy = n;
          write(v);
        },
        onComplete: finish,
      }),
    ];
  };

  /** keep every icon on a valid, free cell (mount, resize, layout changes) */
  const reflow = (animateMoves: boolean) => {
    const scene = sceneRef.current;
    if (!scene || scene.clientWidth === 0) return;
    const m = readMetrics(scene);
    const untouched = !desktopMemory.arranged();
    const placed = new Set<string>();
    const rects = blockers();
    const blocked = (c: Cell) => {
      const p = cellPos(m, c);
      const box = { left: p.x + 10, top: p.y + 4, right: p.x + m.cw - 10, bottom: p.y + m.ch - 8 };
      return rects.some((b) => intersects(box, b));
    };
    DESKTOP_ICONS.forEach((id, i) => {
      const v = L(id);
      if (drag.current?.ids.includes(id)) {
        placed.add(key(v.cell));
        return;
      }
      let want = untouched ? flowCell(i, m.flowRows) : v.cell;
      if (want.c >= m.cols || want.r >= m.rows || placed.has(key(want)) || blocked(want)) {
        const taken = new Set(placed);
        for (let c = 0; c < m.cols; c++) for (let r = 0; r < m.rows; r++) if (blocked({ c, r })) taken.add(key({ c, r }));
        const p = cellPos(m, { c: Math.min(want.c, m.cols - 1), r: Math.min(want.r, m.rows - 1) });
        want = nearestFree(m, p.x, p.y, taken);
      }
      placed.add(key(want));
      if (want.c === v.cell.c && want.r === v.cell.r) return;
      v.cell = want;
      if (animateMoves && !reduced) fly(id, m, 0, 0, false);
      else {
        v.anims.forEach((a) => a.stop());
        commit(v);
      }
    });
    if (!untouched) remember();
  };

  // before first paint on the client: fit the arrangement to this screen
  useLayoutEffect(() => {
    reflow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => reflow(true));
    });
    ro.observe(scene);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    const all = live.current;
    return () => {
      for (const v of Object.values(all)) v.anims.forEach((a) => a.stop());
    };
  }, []);

  /* ── opening ── */
  const open = (id: DesktopIconId, el: HTMLElement) => {
    if (id === "readme") {
      onReadme();
      return;
    }
    const app = APPS.find((a) => a.id === id);
    if (!app) return;
    markLaunch(el);
    blip("open");
    router.push(path(app.path), { transitionTypes: ["app-open"] });
  };

  /* ── pointer ── */
  const onPointerDown = (id: DesktopIconId) => (e: React.PointerEvent<HTMLElement>) => {
    touchTap.current = e.pointerType === "touch";
    if (e.pointerType === "touch") return; // touch: a tap opens, the page keeps scrolling
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
    } else if (!selected.has(id)) {
      setSelected(new Set([id]));
    }
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    drag.current = {
      pid: e.pointerId,
      id,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      touch: false,
      ids: [],
      start: {},
      samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      bounds: { minDx: -Infinity, maxDx: Infinity, minDy: -Infinity, maxDy: Infinity },
    };
    if (id !== "readme") router.prefetch(path(APPS.find((a) => a.id === id)?.path ?? "/"));
  };

  const beginDrag = (d: Drag, el: HTMLElement) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const m = readMetrics(scene);
    d.moved = true;
    d.ids = selected.has(d.id) ? DESKTOP_ICONS.filter((i) => selected.has(i)) : [d.id];
    let gl = Infinity;
    let gt = Infinity;
    let gr = -Infinity;
    let gb = -Infinity;
    for (const id of d.ids) {
      const v = L(id);
      v.anims.forEach((a) => a.stop());
      v.anims = [];
      d.start[id] = { ox: v.ox, oy: v.oy };
      const p = cellPos(m, v.base);
      gl = Math.min(gl, p.x + v.ox);
      gt = Math.min(gt, p.y + v.oy);
      gr = Math.max(gr, p.x + v.ox + m.cw);
      gb = Math.max(gb, p.y + v.oy + m.ch);
      if (v.el) v.el.dataset.dragging = "";
    }
    const bottom = m.H - 8;
    d.bounds = { minDx: 4 - gl, maxDx: m.W - 4 - gr, minDy: m.top - 8 - gt, maxDy: bottom - gb };
    el.setPointerCapture(d.pid);
    sceneRef.current?.setAttribute("data-icon-drag", "");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      beginDrag(d, e.currentTarget);
    }
    pushSample(d.samples, { t: e.timeStamp, x: e.clientX, y: e.clientY });
    const scene = sceneRef.current;
    const W = scene?.clientWidth ?? window.innerWidth;
    const H = scene?.clientHeight ?? window.innerHeight;
    const bx = band(dx, d.bounds.minDx, d.bounds.maxDx, W);
    const by = band(dy, d.bounds.minDy, d.bounds.maxDy, H);
    for (const id of d.ids) {
      const v = L(id);
      v.ox = d.start[id].ox + bx;
      v.oy = d.start[id].oy + by;
      write(v);
    }
  };

  const drop = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // a plain click on one of several selected icons selects just it
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!cancelled && !additive && selected.size > 1 && selected.has(d.id)) setSelected(new Set([d.id]));
      return;
    }
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    sceneRef.current?.removeAttribute("data-icon-drag");
    const scene = sceneRef.current;
    if (!scene) return;
    const m = readMetrics(scene);
    const { vx, vy } = cancelled || reduced ? { vx: 0, vy: 0 } : releaseVelocity(d.samples, e.timeStamp);
    const thrown = Math.hypot(vx, vy) > FLING;
    // where the throw would come to rest, scroll-deceleration style
    const px = reduced ? 0 : project(vx, 0.995);
    const py = reduced ? 0 : project(vy, 0.995);
    const taken = occupancy(m, new Set(d.ids));
    // primary first, so the icon under the hand gets its cell
    const order = [d.id, ...d.ids.filter((i) => i !== d.id)];
    for (const id of order) {
      const v = L(id);
      const base = cellPos(m, v.base);
      const restX = base.x + v.ox + px;
      const restY = base.y + v.oy + py;
      // clamp the projection to the grid so a hard throw lands on the edge, not past it
      const cx = Math.min(Math.max(restX, cellPos(m, { c: m.cols - 1, r: 0 }).x), cellPos(m, { c: 0, r: 0 }).x);
      const cy = Math.min(Math.max(restY, m.top), cellPos(m, { c: 0, r: m.rows - 1 }).y);
      const cell = nearestFree(m, cx, cy, taken);
      taken.add(key(cell));
      v.cell = cell;
      if (v.el) delete v.el.dataset.dragging;
      fly(id, m, vx, vy, thrown);
    }
    // from now on the desktop is arranged by hand, and remembered
    remember();
    blip("tick");
  };

  const onClick = (id: DesktopIconId) => (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (suppressClick.current) {
      e.preventDefault();
      return;
    }
    // keyboard / assistive tech activation (detail 0), a double-click, or a tap
    const activate = e.detail === 0 || e.detail >= 2 || touchTap.current;
    const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    if (activate && !(modified && e.detail !== 0)) {
      e.preventDefault();
      open(id, el);
      return;
    }
    // a single click only selects (Finder): the link doesn't navigate
    e.preventDefault();
  };

  /* ── keyboard ── */
  const onKeyDown = (id: DesktopIconId) => (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelected(new Set(DESKTOP_ICONS));
      return;
    }
    if (e.key === "Escape") {
      if (selected.size) {
        e.preventDefault();
        setSelected(new Set());
      }
      return;
    }
    const dir =
      e.key === "ArrowRight" ? [1, 0] : e.key === "ArrowLeft" ? [-1, 0] : e.key === "ArrowDown" ? [0, 1] : e.key === "ArrowUp" ? [0, -1] : null;
    if (!dir) return;
    e.preventDefault();
    // spatial: the closest icon in that direction (cells: c grows leftward)
    const here = L(id).cell;
    const hx = -here.c;
    const hy = here.r;
    let best: DesktopIconId | null = null;
    let bestScore = Infinity;
    for (const other of DESKTOP_ICONS) {
      if (other === id) continue;
      const c = L(other).cell;
      const ddx = -c.c - hx;
      const ddy = c.r - hy;
      const along = ddx * dir[0] + ddy * dir[1];
      if (along <= 0) continue;
      const across = Math.abs(ddx * dir[1]) + Math.abs(ddy * dir[0]);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    if (best) {
      setFocusId(best);
      setSelected(new Set([best]));
      L(best).el?.focus();
    }
  };

  // roving tab stop: the focused icon, else the first selected, else the first
  const firstSelected = DESKTOP_ICONS.find((i) => selected.has(i));
  const tabStop = focusId ?? firstSelected ?? DESKTOP_ICONS[0];

  return (
    <div className="app-home-icons" role="group" aria-label={t.home.icons.label}>
      <span id={hintId} hidden>
        {fine ? t.home.icons.hint : t.home.icons.hintTouch}
      </span>
      {DESKTOP_ICONS.map((id) => {
        const app = APPS.find((a) => a.id === id);
        const label = id === "readme" ? t.home.icons.readme : t.shell.apps[id];
        const common = {
          ref: (el: HTMLElement | null) => {
            L(id).el = el;
          },
          "data-desktop-icon": id,
          "data-selected": selected.has(id) || undefined,
          className: "app-home-icon",
          style: { "--c": initial[id].c, "--r": initial[id].r } as React.CSSProperties,
          tabIndex: tabStop === id ? 0 : -1,
          draggable: false,
          "aria-describedby": hintId,
          onPointerDown: onPointerDown(id),
          onPointerMove,
          onPointerUp: (e: React.PointerEvent<HTMLElement>) => drop(e, false),
          onPointerCancel: (e: React.PointerEvent<HTMLElement>) => drop(e, true),
          onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => {
            if (drag.current?.moved) drop(e, true);
          },
          onClick: onClick(id),
          onKeyDown: onKeyDown(id),
          onFocus: () => {
            setFocusId(id);
            if (!selected.has(id)) setSelected(new Set([id]));
          },
          onDragStart: (e: React.DragEvent) => e.preventDefault(),
        };
        const inner = (
          <>
            <span className="app-home-icon-tile">
              <DesktopGlyph id={id} size={ICON} />
            </span>
            <span className="app-home-icon-label">{label}</span>
          </>
        );
        return id === "readme" || !app ? (
          <button key={id} type="button" {...common}>
            {inner}
          </button>
        ) : (
          <a key={id} href={path(app.path)} {...common}>
            {inner}
          </a>
        );
      })}
    </div>
  );
}
