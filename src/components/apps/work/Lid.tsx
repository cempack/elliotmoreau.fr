"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RepoInfo } from "@/lib/github";
import { PIXEL_GLYPHS } from "@/components/PixelLabel";
import { cellPaths } from "@/lib/pxpath";
import { project, spring } from "@/lib/motion";
import { itemId, langColor } from "./model";
import { useWork } from "./store";
import { MarkBadge } from "./Signals";

/**
 * The Sticker Lid: the repos as die-cut vinyl stickers on a laptop lid.
 * Every visual is a fact: size is stars (three steps on a log scale),
 * colour is the language, the shine and the wear are the time since the
 * last push (glossy this week, matte, faded, then a corner lifting after a
 * year). The pinned repo (featured in the admin panel) is the big one in
 * the middle. The layout is a
 * packing seeded by the names: it looks hand-placed but is the same on
 * every visit.
 *
 * Hover lifts a sticker and its nearest corner; grab that corner and the
 * fold follows the hand, white backing showing past the fold; let go past
 * half the diagonal (projected) and it comes off into Quick Look, which
 * zooms out of it. A click, a tap or Enter plays the peel by itself.
 * Searches and folders dim what doesn't match instead of removing it.
 */

const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
const MARGIN = "#ebe9e1";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the name on one or two lines, split at a dash near the middle */
function linesOf(name: string) {
  const up = name.toUpperCase();
  if (up.length <= 9) return [up];
  const dashes = [...up.matchAll(/[-_.]/g)].map((m) => m.index ?? 0);
  if (!dashes.length) return [up.slice(0, Math.ceil(up.length / 2)), up.slice(Math.ceil(up.length / 2))];
  const mid = up.length / 2;
  const cut = dashes.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [up.slice(0, cut + 1), up.slice(cut + 1)];
}
const textW = (s: string) => Math.max(0, [...s].length * 4 - 1);

type Shape = "hex" | "pill" | "rect";
type Wear = 0 | 1 | 2 | 3;

type Sticker = {
  repo: RepoInfo;
  lines: string[];
  shape: Shape;
  wear: Wear;
  /** text cell size in px (the size step) */
  px: number;
  /** body size in its own cells */
  w: number;
  h: number;
  /** position on the lid, CSS px */
  x: number;
  y: number;
  lift: "tl" | "tr" | "bl" | "br";
};

function mixHex(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)).join(",")})`;
}

function wearOf(pushedAt: string, now: number): Wear {
  const days = (now - Date.parse(pushedAt)) / 86_400_000;
  if (!Number.isFinite(days)) return 1;
  return days <= 7 ? 0 : days <= 92 ? 1 : days <= 365 ? 2 : 3;
}

/** the sticker's pixels: kiss-cut white margin, the field, the name, its wear */
function paintSticker(s: Sticker) {
  const W = s.w + 2; // + margin
  const H = s.h + 2;
  const out: { x: number; y: number; c: string }[] = [];
  const field = langColor(s.repo.language);
  const inside = (x: number, y: number, inset: number) => {
    const w = W - inset * 2;
    const h = H - inset * 2;
    const lx = x - inset;
    const ly = y - inset;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return false;
    if (s.shape === "pill") {
      const r = h / 2;
      const cx = lx < r ? r : lx > w - r ? w - r : lx + 0.5;
      return Math.hypot(lx + 0.5 - cx, ly + 0.5 - r) <= r;
    }
    if (s.shape === "hex") {
      // pointed at the left and right: the inset grows from the middle row out
      const c = Math.max(2, Math.round(h * 0.32));
      const d = Math.min(lx, w - 1 - lx);
      return d + 0.5 >= (Math.abs(ly + 0.5 - h / 2) / (h / 2)) * c;
    }
    // rounded rect: one cell off each corner
    const cx = lx === 0 || lx === w - 1;
    const cy = ly === 0 || ly === h - 1;
    return !(cx && cy);
  };
  // text cells
  const text = new Set<number>();
  const th = s.lines.length * 6 - 1;
  s.lines.forEach((line, li) => {
    let x0 = Math.round((W - textW(line)) / 2);
    const y0 = Math.round((H - th) / 2) + li * 6;
    for (const ch of line) {
      const g = PIXEL_GLYPHS[ch];
      if (g)
        for (let gy = 0; gy < 5; gy++)
          for (let gx = 0; gx < 3; gx++) if (g[gy][gx] === "1") text.add((y0 + gy) * W + x0 + gx);
      x0 += 4;
    }
  });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y, 0)) continue;
      const body = inside(x, y, 1);
      let c = body ? (text.has(y * W + x) ? "#0d100e" : field) : MARGIN;
      // weathering: faded toward the lid in dithered steps
      if (body && s.wear >= 2 && bayer(x, y) < (s.wear === 2 ? 0.25 : 0.5)) c = s.wear === 3 && text.has(y * W + x) ? "#3a403b" : "#59605a";
      // fresh: a two-cell gloss band across it
      if (body && s.wear === 0 && !text.has(y * W + x)) {
        const band = (x - y * 0.8 - W * 0.3) / 2;
        if (band >= 0 && band < 1) c = mixHex(field, "#ffffff", 0.45);
      }
      out.push({ x, y, c });
    }
  }
  return { W, H, out };
}

function layout(repos: RepoInfo[], width: number, phone: boolean, now: number, pinnedName?: string) {
  const maxStars = Math.max(1, ...repos.map((r) => r.stars));
  const base = repos.map((repo) => {
    const lines = linesOf(repo.name);
    const pinned = !!pinnedName && repo.name.toLowerCase() === pinnedName.toLowerCase();
    const step = pinned ? 2 : repo.stars <= 0 ? 0 : Math.min(2, Math.floor((Math.log1p(repo.stars) / Math.log1p(maxStars)) * 2.999));
    const shape: Shape = lines.length === 1 && lines[0].length <= 6 ? "hex" : lines.length === 1 ? "pill" : "rect";
    const tw = Math.max(...lines.map(textW));
    const w = tw + (shape === "hex" ? 10 : shape === "pill" ? 9 : 6);
    const h = lines.length * 6 - 1 + 6;
    return { repo, lines, shape, wear: wearOf(repo.pushedAt, now), step, w, h, pinned };
  });
  // the lid: 16:10, portrait on phones; stickers sized (three steps) so
  // together they cover about a third of it, whole pixels per cell
  let height = Math.round(phone ? width * 1.3 : width * 0.56);
  const unit = (step: number) => [2, 3, 4][step];
  const area = base.reduce((a, s) => a + (s.w + 3) * (s.h + 3) * unit(s.step) ** 2, 0);
  const k = Math.max(1, Math.min(phone ? 1.2 : 1.9, Math.sqrt((width * height * 0.32) / Math.max(1, area))));
  const sized = base.map((s) => ({ ...s, px: Math.max(2, Math.round(unit(s.step) * k)) }));
  // biggest first; the pinned one at the centre
  sized.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.px * b.w * b.h - a.px * a.w * a.h || a.repo.name.localeCompare(b.repo.name));
  const placed: Sticker[] = [];
  const gap = 14;
  const pxW = (s: (typeof sized)[number]) => (s.w + 3) * s.px;
  const pxH = (s: (typeof sized)[number]) => (s.h + 3) * s.px;
  for (let attempt = 0; attempt < 10; attempt++) {
    placed.length = 0;
    let ok = true;
    for (const s of sized) {
      const w = Math.min(pxW(s), width - 24);
      const h = pxH(s);
      const r = rng(hash(s.repo.name) + attempt * 977);
      let spot: { x: number; y: number } | null = null;
      if (s.pinned && !placed.length) spot = { x: (width - w) / 2, y: (height - h) / 2 };
      // seeded spots anywhere on the lid, as if stuck on by hand
      for (let n = 0; n < 600 && !spot; n++) {
        const x = Math.round(16 + r() * (width - w - 32));
        const y = Math.round(16 + r() * (height - h - 32));
        if (placed.some((p) => x < p.x + (p.w + 3) * p.px + gap && x + w + gap > p.x && y < p.y + (p.h + 3) * p.px + gap && y + h + gap > p.y)) continue;
        spot = { x, y };
      }
      if (!spot) {
        ok = false;
        break;
      }
      const corners = ["tl", "tr", "bl", "br"] as const;
      placed.push({ ...s, x: Math.round(spot.x / s.px) * s.px, y: Math.round(spot.y / s.px) * s.px, lift: corners[hash(s.repo.name) % 4] });
    }
    if (ok) break;
    height = Math.round(height * 1.12);
  }
  return { stickers: placed, height };
}

type Pt = { x: number; y: number };

/** the fold for a sticker's corner dragged to P (local px): front clip + backing flap */
function fold(P: Pt, C: Pt, w: number, h: number) {
  const dx = C.x - P.x;
  const dy = C.y - P.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const n = { x: dx / len, y: dy / len };
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };
  const side = (q: Pt) => (q.x - M.x) * n.x + (q.y - M.y) * n.y;
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const flat: Pt[] = [];
  const flap: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const sa = side(a);
    const sb = side(b);
    (sa <= 0 ? flat : flap).push(a);
    if ((sa <= 0) !== (sb <= 0)) {
      const t = sa / (sa - sb);
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      flat.push(q);
      flap.push(q);
    }
  }
  const k = 2 * (M.x * n.x + M.y * n.y);
  const poly = (p: Pt[]) => `polygon(${p.map((q) => `${q.x.toFixed(1)}px ${q.y.toFixed(1)}px`).join(", ")})`;
  return {
    flat: flat.length ? poly(flat) : "inset(50%)",
    flap: flap.length ? poly(flap) : "inset(50%)",
    matrix: `matrix(${1 - 2 * n.x * n.x}, ${-2 * n.x * n.y}, ${-2 * n.x * n.y}, ${1 - 2 * n.y * n.y}, ${k * n.x}, ${k * n.y})`,
  };
}

function StickerArt({ s }: { s: Sticker }) {
  const art = useMemo(() => {
    const a = paintSticker(s);
    return { W: a.W, H: a.H, paths: cellPaths(a.out, (p) => p.c, 0.02) };
  }, [s]);
  return (
    <svg viewBox={`0 0 ${art.W} ${art.H}`} width={art.W * s.px} height={art.H * s.px} shapeRendering="crispEdges" aria-hidden className="app-work-sticker-svg">
      {art.paths.map((p) => (
        <path key={p.fill} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

export function Lid({
  repos,
  visible,
  selected,
  phone,
  onSelect,
  onOpen,
  label,
  title,
  pinned,
}: {
  repos: RepoInfo[];
  /** what matches the search and folder: the rest is dimmed, not removed */
  visible: Set<string>;
  selected: string | null;
  phone: boolean;
  onSelect: (name: string) => void;
  onOpen: (name: string) => void;
  label: (r: RepoInfo) => string;
  /** the listbox's name */
  title: string;
  /** the featured repo's name: the big sticker in the middle */
  pinned?: string;
}) {
  const { ci, marks } = useWork();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [now, setNow] = useState(0);
  const [hover, setHover] = useState<{ name: string; corner: Sticker["lift"]; gx: number } | null>(null);
  const [peel, setPeel] = useState<{ name: string; P: Pt; C: Pt } | null>(null);
  const g = useRef<{ pid: number; name: string; C: Pt; off: Pt; s: { t: number; x: number; y: number }[]; moved: boolean; corner: boolean } | null>(null);
  const flight = useRef<AnimationPlaybackControls[]>([]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    const id = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      ro.disconnect();
      window.clearTimeout(id);
    };
  }, []);

  const lid = useMemo(() => (width && now ? layout(repos, width, phone, now, pinned) : null), [repos, width, phone, now, pinned]);
  const byName = useMemo(() => new Map(lid?.stickers.map((s) => [s.repo.name, s]) ?? []), [lid]);

  const stop = () => {
    flight.current.forEach((f) => f.stop());
    flight.current = [];
  };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sizeOf = (s: Sticker) => ({ w: (s.w + 2) * s.px, h: (s.h + 2) * s.px });
  const cornerPt = (s: Sticker, c: Sticker["lift"]): Pt => {
    const { w, h } = sizeOf(s);
    return { x: c[1] === "r" ? w : 0, y: c[0] === "b" ? h : 0 };
  };

  /** spring the peel point to `to`, then `done` */
  const fly = (name: string, C: Pt, from: Pt, to: Pt, v: Pt, done: () => void) => {
    stop();
    let x = from.x;
    let y = from.y;
    let left = 2;
    const end = () => --left === 0 && done();
    flight.current = [
      animate(from.x, to.x, { ...spring.default, velocity: v.x, onUpdate: (val) => ((x = val), setPeel({ name, C, P: { x, y } })), onComplete: end }),
      animate(from.y, to.y, { ...spring.default, velocity: v.y, onUpdate: (val) => ((y = val), setPeel({ name, C, P: { x, y } })), onComplete: end }),
    ];
  };

  /** peel it off by itself (click, tap, Enter), then Quick Look */
  const autoPeel = (s: Sticker) => {
    onSelect(s.repo.name);
    if (reduced()) {
      onOpen(s.repo.name);
      return;
    }
    const C = cornerPt(s, s.lift);
    const { w, h } = sizeOf(s);
    const to = { x: w - C.x + (C.x ? -w * 0.1 : w * 0.1), y: h - C.y + (C.y ? -h * 0.1 : h * 0.1) };
    stop();
    flight.current = [
      animate(0, 1, {
        duration: 0.24,
        ease: [0.4, 0, 0.6, 1],
        onUpdate: (t) => setPeel({ name: s.repo.name, C, P: { x: C.x + (to.x - C.x) * t * 0.55, y: C.y + (to.y - C.y) * t * 0.55 } }),
        onComplete: () => {
          onOpen(s.repo.name);
          setPeel(null);
        },
      }),
    ];
  };

  const local = (e: React.PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, s: Sticker) => {
    if (e.button !== 0) return;
    const p = local(e, e.currentTarget);
    const { w, h } = sizeOf(s);
    const corner = (p.y < h / 2 ? "t" : "b") + (p.x < w / 2 ? "l" : "r");
    const C = cornerPt(s, corner as Sticker["lift"]);
    // a peel starts from a corner (44px reach); anywhere else is a tap
    const nearCorner = Math.hypot(p.x - C.x, p.y - C.y) < Math.max(22, Math.min(w, h) * 0.45);
    stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = { pid: e.pointerId, name: s.repo.name, C, off: { x: p.x - C.x, y: p.y - C.y }, s: [], moved: false, corner: nearCorner };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>, s: Sticker) => {
    const d = g.current;
    const p = local(e, e.currentTarget);
    if (!d) {
      if (e.pointerType !== "mouse") return;
      const { w } = sizeOf(s);
      const corner = ((p.y < sizeOf(s).h / 2 ? "t" : "b") + (p.x < w / 2 ? "l" : "r")) as Sticker["lift"];
      if (hover?.name !== s.repo.name || hover.corner !== corner || Math.abs(hover.gx - p.x / w) > 0.04) setHover({ name: s.repo.name, corner, gx: p.x / w });
      return;
    }
    if (d.pid !== e.pointerId) return;
    const dx = p.x - d.C.x - d.off.x;
    const dy = p.y - d.C.y - d.off.y;
    if (!d.moved) {
      // touch: only a clearly diagonal pull from the corner peels; the page scrolls otherwise
      if (Math.hypot(dx, dy) < 10) return;
      if (!d.corner || (e.pointerType !== "mouse" && Math.min(Math.abs(dx), Math.abs(dy)) < Math.max(Math.abs(dx), Math.abs(dy)) * 0.35)) {
        g.current = null;
        return;
      }
      d.moved = true;
    }
    d.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    const cell = s.px;
    setPeel({ name: s.repo.name, C: d.C, P: { x: Math.round((p.x - d.off.x) / cell) * cell, y: Math.round((p.y - d.off.y) / cell) * cell } });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>, s: Sticker) => {
    const d = g.current;
    g.current = null;
    if (!d || d.pid !== e.pointerId) return;
    if (!d.moved) {
      autoPeel(s);
      return;
    }
    let v = { x: 0, y: 0 };
    if (d.s.length > 1 && e.timeStamp - d.s[d.s.length - 1].t < 60) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      const dt = Math.max(8, b.t - a.t);
      v = { x: ((b.x - a.x) / dt) * 1000, y: ((b.y - a.y) / dt) * 1000 };
    }
    const cur = peel?.P ?? d.C;
    const { w, h } = sizeOf(s);
    const reach = Math.hypot(cur.x + project(v.x) - d.C.x, cur.y + project(v.y) - d.C.y);
    if (reach > Math.hypot(w, h) * 0.5) {
      onSelect(s.repo.name);
      onOpen(s.repo.name);
      setPeel(null);
      return;
    }
    fly(s.repo.name, d.C, cur, d.C, v, () => setPeel(null));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!lid) return;
    const cur = byName.get(selected ?? "") ?? lid.stickers[0];
    if (!cur) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      autoPeel(cur);
      return;
    }
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    // the nearest sticker that way, by centres
    const c = (s: Sticker) => ({ x: s.x + sizeOf(s).w / 2, y: s.y + sizeOf(s).h / 2 });
    const a = c(cur);
    let best: Sticker | null = null;
    let bd = Infinity;
    for (const s of lid.stickers) {
      if (s === cur) continue;
      const b = c(s);
      const along = (b.x - a.x) * dir[0] + (b.y - a.y) * dir[1];
      if (along <= 0) continue;
      const across = Math.abs((b.x - a.x) * dir[1] - (b.y - a.y) * dir[0]);
      const dd = along + across * 2;
      if (dd < bd) {
        bd = dd;
        best = s;
      }
    }
    if (best) {
      onSelect(best.repo.name);
      document.getElementById(itemId(best.repo.name))?.focus({ preventScroll: true });
    }
  };

  return (
    <div
      ref={wrap}
      className="app-work-lid"
      role="listbox"
      aria-label={title}
      style={{ height: lid?.height ?? (phone ? 480 : 420) }}
      onKeyDown={onKeyDown}
    >
      {lid?.stickers.map((s) => {
        const on = s.repo.name === selected;
        const dim = !visible.has(s.repo.name);
        const { w, h } = sizeOf(s);
        const p = peel?.name === s.repo.name ? fold(peel.P, peel.C, w, h) : null;
        const hov = hover?.name === s.repo.name;
        const liftCorner = hov ? hover.corner : s.wear === 3 ? s.lift : null;
        return (
          <div
            key={s.repo.name}
            id={itemId(s.repo.name)}
            role="option"
            aria-selected={on}
            aria-label={label(s.repo)}
            tabIndex={on || (!selected && s === lid.stickers[0]) ? 0 : -1}
            className="app-work-sticker"
            data-dim={dim || undefined}
            data-hover={hov || undefined}
            data-peeling={p ? "" : undefined}
            data-wear={s.wear}
            data-no-drag
            style={{ left: s.x, top: s.y, width: w, height: h, "--px": `${s.px}px` } as React.CSSProperties}
            onPointerDown={(e) => onPointerDown(e, s)}
            onPointerMove={(e) => onPointerMove(e, s)}
            onPointerUp={(e) => onPointerUp(e, s)}
            onPointerCancel={() => {
              g.current = null;
              if (peel?.name === s.repo.name) fly(s.repo.name, peel.C, peel.P, peel.C, { x: 0, y: 0 }, () => setPeel(null));
            }}
            onPointerLeave={() => hov && setHover(null)}
            onFocus={() => onSelect(s.repo.name)}
          >
            <span className="app-work-sticker-face" data-ql-origin style={{ clipPath: p?.flat }}>
              <StickerArt s={s} />
            </span>
            {/* a failing build: a small red dot on the sticker; new since last visit: a stamp */}
            {ci[s.repo.name]?.state === "failing" && <span className="app-work-sticker-fail" aria-hidden />}
            {marks[s.repo.name] && (
              <span className="app-work-sticker-mark" aria-hidden>
                <MarkBadge mark={marks[s.repo.name]} />
              </span>
            )}
            {/* a corner lifting: the white backing showing */}
            {!p && liftCorner && <span className="app-work-sticker-corner" data-c={liftCorner} aria-hidden />}
            {p && (
              <span className="app-work-sticker-flap" style={{ transform: p.matrix, clipPath: p.flap }} aria-hidden>
                <span className="app-work-sticker-flap-art">
                  <StickerArt s={s} />
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
