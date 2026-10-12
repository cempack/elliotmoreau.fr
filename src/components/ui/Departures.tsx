"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useThemeTokens } from "@/hooks/useTheme";
import { mix, type ThemeTokens } from "@/lib/theme";
import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import { useSound } from "@/lib/sound";

/**
 * A split-flap departures board, the kind at Toulouse-Blagnac (TLS), for
 * the top of an empty Spotlight: what's new (the latest post, push, the
 * song on, the current focus), each row a real option. Every character
 * is a flap tile (a 3×5 pixel glyph on two dark halves split by a hinge),
 * painted on one DPR-aware canvas, repainted only when something moves.
 *
 * The flaps are the only motion, and every flip is a real change: on a
 * first visit the rows riffle in once; after that a row flips only when
 * it differs from what this visitor saw last time, the music row when the
 * track changes, the clock's minute each minute. A flip steps each tile
 * forward through the drum (at most 8 steps, 30 ms each, no easing), 10 ms
 * between columns and 60 ms between rows.
 */

export type BoardRow = {
  id: string;
  time: string;
  dest: string;
  via: string;
  status: string;
  /** the status in lime (playing now) */
  lime?: boolean;
  /** identity of what the row shows: a different key since the last visit flips it */
  key: string;
  /** remembered between visits (posts, pushes); the music row only flips live */
  remember: boolean;
  /** the real, unfolded text for screen readers */
  label: string;
};

const SEEN_KEY = "em-board";
type Seen = Record<string, string>;
function readSeen(): Seen | null {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
    return v && typeof v === "object" ? (v as Seen) : null;
  } catch {
    return null;
  }
}

const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:-/'";
const TW = 10;
const TH = 16;
const GAP = 1;
const PITCH = TW + GAP;
/** row height: 22 px on a desk, a 40 px touch target on phones */
const rowHeight = (narrow: boolean) => (narrow ? 40 : 22);
const STEP = 30;
const MAX_STEPS = 8;

/** the board's inks, from the live theme: dark flaps, warm times, pale destinations */
const inkFor = (t: ThemeTokens) => ({
  top: mix(t.ink800, t.ink700, 0.45),
  bottom: t.ink800,
  seam: t.ink950,
  ember: t.ember,
  label: t.label,
  via: t.label2,
  lime: t.signal,
});

const fold = (s: string) =>
  [...s.toUpperCase()].map((ch) => {
    const c = PIXEL_FOLD[ch] ?? ch;
    return DRUM.includes(c) ? c : c === "’" ? "'" : " ";
  });

type Tile = { cur: string; target: string; steps: number; at: number; color: string };

type Layout = { cols: { key: "time" | "dest" | "via" | "status"; x: number; n: number }[]; n: number; rowH: number };

function layoutFor(width: number): Layout {
  const n = Math.max(24, Math.floor((width + GAP) / PITCH));
  const narrow = n < 44;
  const time = 5;
  const status = 8;
  if (narrow) {
    const dest = n - time - status - 2;
    return { n, rowH: rowHeight(true), cols: [
      { key: "time", x: 0, n: time },
      { key: "dest", x: time + 1, n: dest },
      { key: "status", x: time + 1 + dest + 1, n: status },
    ] };
  }
  const rest = n - time - status - 3;
  const dest = Math.round(rest * 0.56);
  const via = rest - dest;
  return { n, rowH: rowHeight(false), cols: [
    { key: "time", x: 0, n: time },
    { key: "dest", x: time + 1, n: dest },
    { key: "via", x: time + 1 + dest + 1, n: via },
    { key: "status", x: time + 1 + dest + 1 + via + 1, n: status },
  ] };
}

function cells(text: string, n: number, right = false) {
  const f = fold(text).slice(0, n);
  const pad = Array(Math.max(0, n - f.length)).fill(" ");
  return right ? [...pad, ...f] : [...f, ...pad];
}

export function DeparturesBoard({
  title,
  code,
  clock,
  rows,
  active,
  reduced,
  optionId,
  onHover,
  onPick,
}: {
  title: string;
  code: string;
  clock: string;
  rows: BoardRow[];
  /** the highlighted row, or -1 */
  active: number;
  reduced: boolean;
  optionId: (row: BoardRow) => string;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tokens = useThemeTokens();
  const INK = useMemo(() => inkFor(tokens), [tokens]);
  const [width, setWidth] = useState(0);
  const tiles = useRef<Tile[][]>([]);
  const raf = useRef(0);
  const { blip } = useSound();
  // what this visitor saw at their last close (null: a first visit, everything riffles)
  const [seen] = useState<Seen | null>(() => (typeof window === "undefined" ? {} : readSeen()));
  const fresh = (r: BoardRow) => r.remember && (seen == null || seen[r.id] !== r.key);
  // on close, remember what was on the board
  const latest = useRef(rows);
  useEffect(() => {
    latest.current = rows;
  }, [rows]);
  useEffect(
    () => () => {
      try {
        const rec: Seen = { ...(readSeen() ?? {}) };
        latest.current.forEach((r) => {
          if (r.remember) rec[r.id] = r.key;
        });
        localStorage.setItem(SEEN_KEY, JSON.stringify(rec));
      } catch {}
    },
    []
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = width ? layoutFor(width) : null;
  const lines = layout ? rows.length + 1 : 0;
  const ROW_H = layout?.rowH ?? 22;
  const cssH = lines ? 22 + rows.length * ROW_H : 0;

  // targets for every tile: the header, then each row
  useEffect(() => {
    if (!layout) return;
    const n = layout.n;
    const head = [...cells(title, n - 10), ...cells(`${code} ${clock}`, 10, true)];
    const want: { chars: string[]; colors: string[]; fresh: boolean }[] = [
      { chars: head, colors: head.map((_, i) => (i >= n - 5 ? INK.ember : INK.label)), fresh: false },
    ];
    rows.forEach((r) => {
      const chars = Array(n).fill(" ");
      const colors = Array(n).fill(INK.label);
      for (const c of layout.cols) {
        const isNew = fresh(r);
        const text = c.key === "status" && reduced && isNew ? "NEW" : r[c.key];
        const cs = cells(text, c.n, c.key === "status");
        const color = c.key === "time" ? INK.ember : c.key === "status" ? (r.lime || (reduced && isNew) ? INK.lime : INK.ember) : c.key === "via" ? INK.via : INK.label;
        cs.forEach((ch, k) => {
          chars[c.x + k] = ch;
          colors[c.x + k] = color;
        });
      }
      want.push({ chars, colors, fresh: fresh(r) });
    });
    const now = performance.now();
    const prev = tiles.current;
    const flipping = new Set<number>();
    tiles.current = want.map((w, row) =>
      w.chars.map((target, col) => {
        const old = prev[row]?.[col];
        // a fresh row riffles in from blank once; otherwise flips from what's showing
        const from = old ? old.cur : w.fresh && !reduced ? " " : target;
        if (from === target || reduced) return { cur: target, target, steps: 0, at: 0, color: w.colors[col] };
        const dist = (DRUM.indexOf(target) - DRUM.indexOf(from) + DRUM.length) % DRUM.length;
        const steps = Math.min(MAX_STEPS, dist || MAX_STEPS);
        const start = DRUM[(DRUM.indexOf(target) - steps + DRUM.length) % DRUM.length];
        flipping.add(row);
        return { cur: start, target, steps, at: now + row * 60 + col * 10, color: w.colors[col] };
      })
    );
    // one soft clatter per flipping row, on its first step
    flipping.forEach((row) => window.setTimeout(() => blip("tick"), row * 60));
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(function frame(t) {
      if (paint(t)) raf.current = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf.current);
    // paint is stable for a given size; rows/clock changes re-target the drums
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.n, rows, title, code, clock, reduced, INK]);

  /** draw every tile; true while any drum is still turning */
  function paint(t: number) {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx || !layout) return false;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const w = layout.n * PITCH - GAP;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(cssH * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(cssH * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${cssH}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, cssH);
    let moving = false;
    tiles.current.forEach((row, r) => {
      const h = r === 0 ? 22 : ROW_H;
      const y0 = (r === 0 ? 0 : 22 + (r - 1) * ROW_H) + (h - TH) / 2;
      row.forEach((tile, c) => {
        // advance the drum, one character per step
        while (tile.steps > 0 && t >= tile.at) {
          const i = DRUM.indexOf(tile.cur);
          tile.cur = DRUM[(i + 1) % DRUM.length];
          tile.steps -= 1;
          tile.at += STEP;
          if (tile.cur === tile.target) tile.steps = 0;
        }
        if (tile.steps > 0) moving = true;
        const x0 = c * PITCH;
        ctx.fillStyle = INK.top;
        ctx.fillRect(x0, y0, TW, TH / 2);
        ctx.fillStyle = INK.bottom;
        ctx.fillRect(x0, y0 + TH / 2, TW, TH / 2);
        ctx.fillStyle = INK.seam;
        ctx.fillRect(x0, y0 + TH / 2, TW, 1);
        const g = PIXEL_GLYPHS[tile.cur];
        if (g) {
          ctx.fillStyle = tile.color;
          for (let gy = 0; gy < 5; gy++)
            for (let gx = 0; gx < 3; gx++) if (g[gy][gx] === "1") ctx.fillRect(x0 + 2 + gx * 2, y0 + 3 + gy * 2, 2, 2);
        }
      });
    });
    return moving;
  }

  return (
    <div ref={wrap} className="em-board" style={{ height: cssH || undefined }}>
      <canvas ref={canvas} className="em-board-canvas" aria-hidden />
      {rows.map((r, i) => (
        <div
          key={r.id}
          id={optionId(r)}
          role="option"
          aria-selected={i === active}
          className="em-board-row"
          style={{ top: 22 + i * ROW_H, height: ROW_H }}
          onPointerMove={() => onHover(i)}
          onClick={() => onPick(i)}
        >
          <span className="sr-only">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
