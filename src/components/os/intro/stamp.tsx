"use client";

import { useId } from "react";
import { EMOS_LINES, GLYPH_H, bandInk, rasterizePixelLine, WORDMARK_BAND_ROWS } from "@/lib/pixelword";

/* ───────────────────────────── the stamp ─────────────────────────────
   How the live field lays a word on its grid (8 px cells, every line as
   big as fits at a whole-cell scale, centred): the canvas and the still
   face both read this one layout, so the still word lands on exactly the
   cells the canvas lights. */

export type Stamp = {
  cols: number;
  rows: number;
  /** lit cells, row-major */
  lit: Uint8Array;
  /** each line's rows: each wears the whole band gradient */
  bands: { from: number; to: number }[];
  /** each line's footprint, in cells */
  lines: { x0: number; y0: number; cols: number; rows: number }[];
};

const stamps = new Map<string, Stamp>();

export function stampWordmark(w: number, h: number, words: readonly string[] = EMOS_LINES): Stamp {
  const k = `${w}x${h}:${words.join("/")}`;
  const hit = stamps.get(k);
  if (hit) return hit;
  const cols = Math.max(12, Math.min(150, Math.round(w / 8)));
  const rows = Math.max(8, Math.min(80, Math.round(h / 8)));
  const glyphs = words.map((l) => rasterizePixelLine(l));
  const n = glyphs.length;
  const nativeW = Math.max(...glyphs.map((l) => l.cols));
  const gapFor = (s: number) => (n > 1 ? Math.max(2, Math.round(s * 0.85)) : 0);
  const height = (s: number) => n * GLYPH_H * s + (n - 1) * gapFor(s);
  let s = Math.max(1, Math.floor((cols * 0.97) / nativeW));
  while (s > 1 && height(s) > rows) s--;
  const top = Math.floor((rows - height(s)) / 2);
  const lit = new Uint8Array(cols * rows);
  const lines = glyphs.map((g, i) => {
    const y0 = top + i * (GLYPH_H * s + gapFor(s));
    const x0 = Math.floor((cols - g.cols * s) / 2);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        if (!g.grid[r * g.cols + c]) continue;
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const cc = x0 + c * s + dx;
            const rr = y0 + r * s + dy;
            if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) lit[rr * cols + cc] = 1;
          }
        }
      }
    }
    return { x0, y0, cols: g.cols * s, rows: GLYPH_H * s };
  });
  const out: Stamp = { cols, rows, lit, bands: lines.map((l) => ({ from: l.y0, to: l.y0 + l.rows - 1 })), lines };
  stamps.set(k, out);
  return out;
}

/* ───────────────────────────── the still face ─────────────────────────────
   The name at rest, as the live field paints it once its entrance has
   settled: the same cells, the same per-row band gradient (each line
   wears the whole stack), the same two-step relief receding up-right, the
   cream lip on every skyline edge and the soft wash around it. Server
   HTML, the hand-over before the canvas's first frame, and the only face
   under reduced motion, so all three are the same name at the same size.
   Drawn as a handful of paths (runs of cells), not thousands of rects. */

type Face = { far: string; near: string; lips: string; inks: [string, string][]; sheen: { cx: number; cy: number; rx: number; ry: number } };
const faces = new Map<string, Face>();

const n2 = (v: number) => String(Math.round(v * 100) / 100);
/** The canvas re-lays each resting cell additively ("lighter" at half its
    alpha), so the ink it shows is a touch brighter than the band itself. */
const lift = (hex: string) =>
  "#" +
  [1, 3, 5]
    .map((i) => Math.min(252, Math.round(parseInt(hex.slice(i, i + 2), 16) * 1.05 + 4)).toString(16).padStart(2, "0"))
    .join("");

function faceFor(w: number, h: number): Face {
  const key = `${w}x${h}`;
  const hit = faces.get(key);
  if (hit) return hit;
  const { cols, rows, lit, bands } = stampWordmark(w, h);
  // open sky: flood from the borders through unlit cells (counters stay holes)
  const sky = new Uint8Array(cols * rows);
  const stack: number[] = [];
  for (let c = 0; c < cols; c++) stack.push(c, (rows - 1) * cols + c);
  for (let r = 0; r < rows; r++) stack.push(r * cols, r * cols + cols - 1);
  while (stack.length) {
    const i = stack.pop() as number;
    if (i < 0 || i >= cols * rows || sky[i] || lit[i]) continue;
    sky[i] = 1;
    const c = i % cols;
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
    stack.push(i - cols, i + cols);
  }
  const isSky = (c: number, r: number) => c < 0 || c >= cols || r < 0 || r >= rows || sky[r * cols + c] === 1;
  const isLit = (c: number, r: number) => c >= 0 && c < cols && r >= 0 && r < rows && lit[r * cols + c] === 1;

  // the band per row: the line's rows spread over the whole stack
  let minR = rows;
  let maxR = -1;
  let minC = cols;
  let maxC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!lit[r * cols + c]) continue;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    }
  }
  const inkOf = (r: number) => {
    const span = bands.find((b) => r >= b.from && r <= b.to) ?? { from: minR, to: maxR };
    const band = Math.min(WORDMARK_BAND_ROWS - 1, Math.floor(((r - span.from) / Math.max(1, span.to - span.from)) * WORDMARK_BAND_ROWS));
    return bandInk(band);
  };

  /** horizontal runs of cells passing `test`, as rects offset by (dx, dy), height hh */
  const runs = (test: (c: number, r: number) => boolean, dx: number, dy: number, hh: number, rowOk: (r: number) => boolean = () => true) => {
    let d = "";
    for (let r = 0; r < rows; r++) {
      if (!rowOk(r)) continue;
      let c = 0;
      while (c < cols) {
        if (!test(c, r)) {
          c++;
          continue;
        }
        const c0 = c;
        while (c < cols && test(c, r)) c++;
        // a hair of overdraw so neighbouring runs never seam
        d += `M${n2(c0 + dx)} ${n2(r + dy)}h${n2(c - c0 + 0.06)}v${n2(hh)}h-${n2(c - c0 + 0.06)}z`;
      }
    }
    return d;
  };

  const far = runs((c, r) => isLit(c, r) && isSky(c + 2, r - 2), 1.6, -2, 1.06);
  const near = runs((c, r) => isLit(c, r) && isSky(c + 1, r - 1), 0.8, -1, 1.06);
  const lips = runs((c, r) => isLit(c, r) && isSky(c, r - 1), 0, 0, 0.45);
  const byInk = new Map<string, number[]>();
  for (let r = 0; r < rows; r++) {
    const ink = inkOf(r);
    const list = byInk.get(ink) ?? [];
    list.push(r);
    byInk.set(ink, list);
  }
  const inks: [string, string][] = [...byInk].map(([ink, rs]) => {
    const set = new Set(rs);
    return [lift(ink), runs(isLit, 0, 0, 1.06, (r) => set.has(r))];
  });
  const out: Face = {
    far,
    near,
    lips,
    inks: inks.filter(([, d]) => d),
    sheen: { cx: (minC + maxC + 1) / 2, cy: (minR + maxR + 1) / 2, rx: (maxC - minC + 1) / 2, ry: (maxR - minR + 1) / 2 },
  };
  faces.set(key, out);
  return out;
}

/** The name at rest in a w × h box (fills it, cell for cell like the canvas). */
export function StillFace({ w, h, className = "" }: { w: number; h: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const f = faceFor(w, h);
  const { cols, rows } = stampWordmark(w, h);
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden
      focusable="false"
      className={className}
    >
      <defs>
        <radialGradient id={`os-boot-sheen-${id}`}>
          <stop offset="0" stopColor="#c9dcc0" stopOpacity={0.15} />
          <stop offset="0.6" stopColor="#c9dcc0" stopOpacity={0.06} />
          <stop offset="1" stopColor="#c9dcc0" stopOpacity={0} />
        </radialGradient>
      </defs>
      <path d={f.far} fill="#050807" fillOpacity={0.38} />
      <path d={f.near} fill="#1b2a26" fillOpacity={0.78} />
      {f.inks.map(([ink, d]) => (
        <path key={ink} d={d} fill={ink} />
      ))}
      <path d={f.lips} fill="#fbf9f4" fillOpacity={0.66} />
      <ellipse cx={f.sheen.cx} cy={f.sheen.cy} rx={f.sheen.rx} ry={f.sheen.ry} fill={`url(#os-boot-sheen-${id})`} />
    </svg>
  );
}
