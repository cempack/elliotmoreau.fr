"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useMedia } from "@/hooks/env";
import { project, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { APPS } from "@/components/os/apps";
import { AppIcon } from "@/components/os/icons";
import { markLaunch } from "@/components/os/dock/launch";
import { useTerminal } from "@/components/os/Terminal";
import { usePalette } from "@/components/ui/palette";
import { DESKTOP_ICONS, DesktopGlyph, type DesktopIconId } from "./icons";
import { desktopMemory, type Cell } from "./store";
import { FLING, band, intersects, pushSample, releaseVelocity, type Rect, type Sample } from "./physics";
import { PHONE, isPhone, safeTopPx } from "./layout";

const ICON = 60;
/** touch: how long a finger rests on an icon before it lifts to move */
const HOLD_MS = 450;
/** …and how far it may wander meanwhile before it counts as a scroll */
const HOLD_SLOP = 8;
/** event-time clock (only ever read from handlers) */
const clock = () => performance.now();

/* Desks show only the README (the apps are in the Dock). Phones get a home
   screen row of what the tab bar doesn't hold: Now, and Terminal and
   Search, which otherwise hide behind More (no README: hello.txt is
   already on the screen). Desk icons are hidden on phones in CSS and the
   phone ones on desks, so the server render is the same for both. */
type PhoneOnly = "now" | "terminal" | "search";
const DESK_ONLY = new Set<DesktopIconId>(["work", "writing", "atlas", "now", "contact", "readme"]);
const PHONE_ROW: PhoneOnly[] = ["now", "terminal", "search"];

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
  // the grid clears the bar plus any top inset, as desktop.css's --app-home-top does
  const top = px("--app-home-grid-t", 60) + safeTopPx();
  const left = px("--app-home-grid-l", 16);
  const bottom = px("--app-home-grid-b", 96);
  const cols = Math.max(1, Math.floor((W - right - left) / cw));
  const rows = Math.max(1, Math.floor((H - top - bottom) / ch));
  return { W, H, cw, ch, right, top, left, cols, rows };
}

const cellPos = (m: Metrics, c: Cell) => ({ x: m.W - m.right - (c.c + 1) * m.cw, y: m.top + c.r * m.ch });
const key = (c: Cell) => `${c.c},${c.r}`;
const clampI = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** the cell whose top-left is nearest a point, ignoring what's in it */
const cellAt = (m: Metrics, x: number, y: number): Cell => ({
  c: clampI(Math.round((m.W - m.right - m.cw - x) / m.cw), 0, m.cols - 1),
  r: clampI(Math.round((y - m.top) / m.ch), 0, m.rows - 1),
});

/** Server arrangement: one column from the top-right. */
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

type Hold = { pid: number; sx: number; sy: number; timer: number };

export type IconsProps = {
  sceneRef: React.RefObject<HTMLElement | null>;
  selected: ReadonlySet<DesktopIconId>;
  setSelected: (s: Set<DesktopIconId>) => void;
  /** rects (scene coordinates) icons may not land on: the widgets, hello.txt */
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
 *   and the icons spring into the nearest free grid cells with the release
 *   velocity, a selection keeping its formation. Touch: hold to lift, then
 *   drag. Reduced motion: no projection, instant snap.
 * - Nothing lands on hello.txt or the widgets.
 */
export function DesktopIcons({ sceneRef, selected, setSelected, blockers, onReadme, reduced, fine }: IconsProps) {
  const { t, path } = useI18n();
  const router = useRouter();
  const { blip } = useSound();
  const terminal = useTerminal();
  const palette = usePalette();
  const phone = useMedia(PHONE);
  const hintId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  // the arrangement this mount starts from: remembered for this tab, else the default column
  const [initial] = useState(() => {
    const out = {} as Record<DesktopIconId, Cell>;
    DESKTOP_ICONS.forEach((id, i) => (out[id] = desktopMemory.cell(id) ?? flowCell(i, 6)));
    return out;
  });
  const live = useRef<Record<string, Live>>({});
  const drag = useRef<Drag | null>(null);
  const hold = useRef<Hold | null>(null);
  /** clicks are swallowed until then (a drag just ended under the hand) */
  const quietUntil = useRef(0);
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

  const quiet = (ms: number) => {
    quietUntil.current = clock() + ms;
  };

  /** remember the whole arrangement once a hand has touched it */
  const remember = () => {
    const cells = {} as Record<DesktopIconId, Cell>;
    for (const id of DESKTOP_ICONS) cells[id] = L(id).cell;
    desktopMemory.arrange(cells);
  };

  /** cells something else covers (by the icon's footprint: tile + label) */
  const blockedCells = (m: Metrics) => {
    const out = new Set<string>();
    const rects = blockers();
    for (let c = 0; c < m.cols; c++) {
      for (let r = 0; r < m.rows; r++) {
        const p = cellPos(m, { c, r });
        const box = { left: p.x + 10, top: p.y + 4, right: p.x + m.cw - 10, bottom: p.y + m.ch - 8 };
        if (rects.some((b) => intersects(box, b))) out.add(key({ c, r }));
      }
    }
    return out;
  };

  /** cells taken by the other icons or blocked */
  const occupancy = (m: Metrics, except: Set<DesktopIconId>) => {
    const taken = blockedCells(m);
    for (const id of DESKTOP_ICONS) if (!except.has(id)) taken.add(key(L(id).cell));
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

  /**
   * The default arrangement, Finder's: down the right edge, then the next
   * column, stepping around whatever is in the way.
   */
  const defaultCells = (m: Metrics, blocked: Set<string>) => {
    const rows = m.rows;
    const out: Cell[] = [];
    for (let c = 0; c < m.cols && out.length < DESKTOP_ICONS.length; c++) {
      for (let r = 0; r < rows && out.length < DESKTOP_ICONS.length; r++) {
        if (!blocked.has(key({ c, r }))) out.push({ c, r });
      }
    }
    for (let i = out.length; i < DESKTOP_ICONS.length; i++) out.push(flowCell(i, m.rows));
    return out;
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

  /** keep every icon on a valid, free cell (mount, resize) */
  const reflow = (animateMoves: boolean) => {
    const scene = sceneRef.current;
    if (!scene || scene.clientWidth === 0 || isPhone()) return;
    const m = readMetrics(scene);
    const untouched = !desktopMemory.arranged();
    const blocked = blockedCells(m);
    const flow = untouched ? defaultCells(m, blocked) : null;
    const placed = new Set<string>();
    DESKTOP_ICONS.forEach((id, i) => {
      const v = L(id);
      if (drag.current?.ids.includes(id)) {
        placed.add(key(v.cell));
        return;
      }
      let want = flow ? flow[i] : v.cell;
      if (want.c >= m.cols || want.r >= m.rows || placed.has(key(want)) || blocked.has(key(want))) {
        const taken = new Set([...placed, ...blocked]);
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
      if (hold.current) window.clearTimeout(hold.current.timer);
    };
  }, []);

  /* touch: once an icon is lifted the finger owns it, not the page. Touch
     listeners from React are passive, so this one is native. */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onMove = (e: TouchEvent) => {
      if (drag.current?.touch && e.cancelable) e.preventDefault();
    };
    grid.addEventListener("touchmove", onMove, { passive: false });
    return () => grid.removeEventListener("touchmove", onMove);
  }, []);

  /* ── opening ── */
  const open = (id: DesktopIconId | PhoneOnly, el: HTMLElement) => {
    if (id === "readme") {
      onReadme();
      return;
    }
    if (id === "terminal") {
      terminal.setOpen(true);
      return;
    }
    if (id === "search") {
      palette.open();
      return;
    }
    const app = APPS.find((a) => a.id === id);
    if (!app) return;
    markLaunch(el.querySelector(".app-home-icon-tile") ?? el);
    blip("open");
    router.push(path(app.path), { transitionTypes: ["app-open"] });
  };

  /* ── pointer ── */
  const clearHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const newDrag = (id: DesktopIconId, pid: number, x: number, y: number, t: number, touch: boolean): Drag => ({
    pid,
    id,
    sx: x,
    sy: y,
    moved: false,
    touch,
    ids: [],
    start: {},
    samples: [{ t, x, y }],
    bounds: { minDx: -Infinity, maxDx: Infinity, minDy: -Infinity, maxDy: Infinity },
  });

  const onPointerDown = (id: DesktopIconId) => (e: React.PointerEvent<HTMLElement>) => {
    touchTap.current = e.pointerType !== "mouse";
    if (isPhone()) return; // phones: a tap opens
    if (e.pointerType === "touch") {
      // rest a finger on an icon and it lifts, ready to move (iPad); a tap
      // still opens and a swipe still scrolls
      clearHold();
      const el = e.currentTarget;
      const { pointerId: pid, clientX: x, clientY: y } = e;
      hold.current = {
        pid,
        sx: x,
        sy: y,
        timer: window.setTimeout(() => {
          hold.current = null;
          if (!selected.has(id)) setSelected(new Set([id]));
          const d = newDrag(id, pid, x, y, clock(), true);
          drag.current = d;
          beginDrag(d, el);
          quiet(60_000);
          navigator.vibrate?.(8);
        }, HOLD_MS),
      };
      return;
    }
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
    drag.current = newDrag(id, e.pointerId, e.clientX, e.clientY, e.timeStamp, false);
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
    try {
      el.setPointerCapture(d.pid);
    } catch {}
    sceneRef.current?.setAttribute("data-icon-drag", "");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const h = hold.current;
    if (h && h.pid === e.pointerId) {
      // moved before the hold matured: that was a scroll, not a pick-up
      if (Math.hypot(e.clientX - h.sx, e.clientY - h.sy) > HOLD_SLOP) clearHold();
      return;
    }
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

  /**
   * A selection lands as one piece, the way Finder keeps a group's shape:
   * the cell under the hand sets the offset, then the nearest offset (in
   * rings around it) where every member fits. Null when none does.
   */
  const rigidPlacement = (m: Metrics, d: Drag, taken: Set<string>, px: number, py: number) => {
    const lead = L(d.id);
    const b = cellPos(m, lead.base);
    const aim = cellAt(m, b.x + lead.ox + px, b.y + lead.oy + py);
    const dc0 = aim.c - lead.cell.c;
    const dr0 = aim.r - lead.cell.r;
    const fits = (dc: number, dr: number) =>
      d.ids.every((id) => {
        const c = L(id).cell;
        const n = { c: c.c + dc, r: c.r + dr };
        return n.c >= 0 && n.c < m.cols && n.r >= 0 && n.r < m.rows && !taken.has(key(n));
      });
    for (let ring = 0; ring <= 4; ring++) {
      const cands: [number, number][] = [];
      for (let i = -ring; i <= ring; i++) {
        for (let j = -ring; j <= ring; j++) if (Math.max(Math.abs(i), Math.abs(j)) === ring) cands.push([i, j]);
      }
      cands.sort((a, z) => a[0] ** 2 + a[1] ** 2 - (z[0] ** 2 + z[1] ** 2));
      for (const [i, j] of cands) {
        if (!fits(dc0 + i, dr0 + j)) continue;
        const out: Record<string, Cell> = {};
        for (const id of d.ids) {
          const c = L(id).cell;
          out[id] = { c: c.c + dc0 + i, r: c.r + dr0 + j };
        }
        return out;
      }
    }
    return null;
  };

  const drop = (e: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const h = hold.current;
    if (h && h.pid === e.pointerId) clearHold();
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) {
      // a plain click on one of several selected icons selects just it
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!cancelled && !additive && selected.size > 1 && selected.has(d.id)) setSelected(new Set([d.id]));
      return;
    }
    // the drag ends on whatever is under the hand: don't let it click
    quiet(d.touch ? 450 : 1000);
    if (!d.touch) window.setTimeout(() => quiet(-1), 0);
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
    const rigid = d.ids.length > 1 ? rigidPlacement(m, d, taken, px, py) : null;
    // primary first, so the icon under the hand gets its cell
    const order = [d.id, ...d.ids.filter((i) => i !== d.id)];
    for (const id of order) {
      const v = L(id);
      let cell = rigid?.[id];
      if (!cell) {
        const base = cellPos(m, v.base);
        const restX = base.x + v.ox + px;
        const restY = base.y + v.oy + py;
        // clamp the projection to the grid so a hard throw lands on the edge, not past it
        const cx = Math.min(Math.max(restX, cellPos(m, { c: m.cols - 1, r: 0 }).x), cellPos(m, { c: 0, r: 0 }).x);
        const cy = Math.min(Math.max(restY, m.top), cellPos(m, { c: 0, r: m.rows - 1 }).y);
        cell = nearestFree(m, cx, cy, taken);
      }
      taken.add(key(cell));
      v.cell = cell;
      if (v.el) delete v.el.dataset.dragging;
      fly(id, m, vx, vy, thrown);
    }
    // from now on the desktop is arranged by hand, and remembered
    remember();
    blip("tick");
  };

  const onClick = (id: DesktopIconId | PhoneOnly) => (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (clock() < quietUntil.current) {
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
    if (!dir || phone) return;
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

  // desks: a roving tab stop (the focused icon, else the first selected,
  // else the first); phones: every icon on the home screen is a stop
  const firstSelected = DESKTOP_ICONS.find((i) => selected.has(i));
  const tabStop = focusId ?? firstSelected ?? DESKTOP_ICONS[0];
  const hint = fine ? t.home.icons.hint : phone ? t.home.icons.hintPhone : t.home.icons.hintTouch;

  const phoneIcon = (id: PhoneOnly) => (
    <button
      key={`p-${id}`}
      type="button"
      data-phone-icon={id}
      className="app-home-icon app-home-icon--phone"
      tabIndex={phone ? 0 : -1}
      onPointerDown={(e) => (touchTap.current = e.pointerType !== "mouse")}
      onClick={onClick(id)}
    >
      <span className="app-home-icon-tile">
        <AppIcon app={id === "search" ? "spotlight" : id} size={ICON} />
      </span>
      <span className="app-home-icon-label">
        {id === "search" ? t.home.icons.search : id === "now" ? t.shell.apps.now : t.shell.apps.terminal}
      </span>
    </button>
  );

  return (
    <div ref={gridRef} className="app-home-icons" role="group" aria-label={t.home.icons.label}>
      <span id={hintId} hidden>
        {hint}
      </span>
      {DESKTOP_ICONS.flatMap((id) => {
        const app = APPS.find((a) => a.id === id);
        const label = id === "readme" ? t.home.icons.readme : t.shell.apps[id];
        const deskOnly = DESK_ONLY.has(id);
        const common = {
          ref: (el: HTMLElement | null) => {
            L(id).el = el;
          },
          "data-desktop-icon": id,
          "data-selected": selected.has(id) || undefined,
          className: `app-home-icon${deskOnly ? " app-home-icon--desk" : ""}`,
          style: { "--c": initial[id].c, "--r": initial[id].r } as React.CSSProperties,
          tabIndex: phone ? (deskOnly ? -1 : 0) : tabStop === id ? 0 : -1,
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
          // a long press means "move" here, not the link's context menu
          onContextMenu: (e: React.MouseEvent) => {
            if (touchTap.current) e.preventDefault();
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
        const node =
          id === "readme" || !app ? (
            <button key={id} type="button" {...common}>
              {inner}
            </button>
          ) : (
            <a key={id} href={path(app.path)} {...common}>
              {inner}
            </a>
          );
        // phones: Terminal and Search follow Now
        return [node];
      })}
      {PHONE_ROW.map(phoneIcon)}
    </div>
  );
}
