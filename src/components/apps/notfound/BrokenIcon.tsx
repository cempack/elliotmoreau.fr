"use client";

import { useId } from "react";
import { m, useSpring, useTransform, type MotionValue } from "motion/react";

/**
 * The app that can't be opened: a pixel app window (traffic lights, a few
 * lines of content, a lime button) cracked top to bottom, its right half
 * slipped down a cell, on a flare-tinted glass squircle like the Dock's
 * tiles. Three pixels have fallen out of the crack and lie under the
 * tile, square on the pixel grid; they hang off the alert on soft
 * springs, so when you drag or throw the alert they trail behind,
 * tumbling a little, and settle back square.
 */

const C = {
  paper: "#f5f2ec",
  paper3: "#9196a6",
  ink950: "#05060a",
  ink900: "#0a0b12",
  ink600: "#262a3a",
  night: "#1d1a45",
  signal: "#c6ff5e",
  ember: "#ffb86b",
  flare: "#ff5f7e",
} as const;

const PAL: Record<string, string> = { W: C.paper, F: C.flare, E: C.ember, S: C.signal, n: C.night, g: C.paper3 };

/* a generic app window, 16×16 cells ("." empty) */
const BASE = [
  "................",
  "................",
  ".WWWWWWWWWWWWWW.",
  ".WFWEWSWWWWWWWW.",
  ".WWWWWWWWWWWWWW.",
  ".WnnnnnnnnnnnnW.",
  ".WnggggggnnnnnW.",
  ".WnnnnnnnnnnnnW.",
  ".WnggggngggnnnW.",
  ".WnnnnnnnnnnnnW.",
  ".WnSSSSnnnnnnnW.",
  ".WnnnnnnnnnnnnW.",
  ".WnnnnnnnnnnnnW.",
  ".WWWWWWWWWWWWWW.",
  "................",
  "................",
];

/** the crack's column on each row (rows 2–13); right of it slips down one row */
const CRACK: Record<number, number> = { 2: 9, 3: 9, 4: 8, 5: 8, 6: 9, 7: 10, 8: 9, 9: 8, 10: 8, 11: 7, 12: 7, 13: 8 };

/** cells that fell out (removed from the glyph; drawn as loose fragments) */
const FALLEN = new Set(["7,13", "10,7", "6,10"]);

type Run = { x: number; y: number; w: number; fill: string };

const GLYPH: { runs: Run[]; shadow: Run[] } = (() => {
  const cells = new Map<string, string>();
  BASE.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === "." || FALLEN.has(`${x},${y}`)) continue;
      const crack = CRACK[y];
      if (crack == null) continue;
      if (x === crack) continue;
      const ty = x > crack ? y + 1 : y;
      // the slipped half never overwrites the half that stayed
      if (x > crack && cells.has(`${x},${ty}`)) continue;
      cells.set(`${x},${ty}`, PAL[ch] ?? C.paper);
    }
  });
  const runs: Run[] = [];
  const shadow: Run[] = [];
  for (let y = 0; y < 16; y++) {
    let x = 0;
    while (x < 16) {
      const fill = cells.get(`${x},${y}`);
      if (!fill) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && cells.get(`${x + w},${y}`) === fill) w++;
      runs.push({ x, y, w, fill });
      x += w;
    }
    // the silhouette dropped one cell, for depth
    x = 0;
    while (x < 16) {
      if (!cells.has(`${x},${y}`)) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < 16 && cells.has(`${x + w},${y}`)) w++;
      shadow.push({ x, y: y + 1, w, fill: "" });
      x += w;
    }
  }
  return { runs, shadow };
})();

/** iOS-style continuous-corner squircle (same curve as the Dock tiles) */
function squircle(size: number, inset = 0) {
  const a = inset;
  const b = size - inset;
  const p = (b - a) * 0.34;
  const h = p * 0.3;
  const f = (n: number) => +n.toFixed(2);
  return (
    `M${f(a + p)} ${f(a)}H${f(b - p)}` +
    `C${f(b - h)} ${f(a)} ${f(b)} ${f(a + h)} ${f(b)} ${f(a + p)}V${f(b - p)}` +
    `C${f(b)} ${f(b - h)} ${f(b - h)} ${f(b)} ${f(b - p)} ${f(b)}H${f(a + p)}` +
    `C${f(a + h)} ${f(b)} ${f(a)} ${f(b - h)} ${f(a)} ${f(b - p)}V${f(a + p)}` +
    `C${f(a)} ${f(a + h)} ${f(a + h)} ${f(a)} ${f(a + p)} ${f(a)}Z`
  );
}

/** Each fragment: where it rests (whole cells from the glyph's origin, so
    it sits on the pixel grid), its size in cells, colour, and how loosely
    it hangs (spring). They lie on one floor a cell under the tile, in its
    shadow, in a little heap below the crack they fell out of. */
const FRAGMENTS = [
  { x: 8, y: 20, w: 2, h: 2, fill: C.paper, k: { stiffness: 210, damping: 9, mass: 0.7 } },
  { x: 5, y: 21, w: 2, h: 1, fill: C.signal, k: { stiffness: 150, damping: 7, mass: 0.6 } },
  { x: 10, y: 21, w: 1, h: 1, fill: C.paper, k: { stiffness: 260, damping: 11, mass: 0.5 } },
] as const;

const LAG = 18; // px: the furthest a fragment trails
/** degrees at full trail: square at rest (crisp pixels), tumbling only in flight */
const TUMBLE = 14;

function Fragment({
  frag,
  cell,
  off,
  ox,
  oy,
}: {
  frag: (typeof FRAGMENTS)[number];
  cell: number;
  off: number;
  ox: MotionValue<number>;
  oy: MotionValue<number>;
}) {
  const sx = useSpring(ox, frag.k);
  const sy = useSpring(oy, frag.k);
  const x = useTransform(() => Math.max(-LAG, Math.min(LAG, sx.get() - ox.get())));
  const y = useTransform(() => Math.max(-LAG, Math.min(LAG, sy.get() - oy.get())));
  const rotate = useTransform(x, [-LAG, LAG], [-TUMBLE, TUMBLE]);
  return (
    <m.span
      aria-hidden
      className="app-nf-frag"
      style={{
        left: off + frag.x * cell,
        top: off + frag.y * cell,
        width: frag.w * cell,
        height: frag.h * cell,
        background: frag.fill,
        rotate,
        x,
        y,
      }}
    />
  );
}

export function BrokenIcon({
  size = 64,
  ox,
  oy,
  loose = true,
}: {
  size?: number;
  /** the alert's offset: fragments trail it */
  ox: MotionValue<number>;
  oy: MotionValue<number>;
  /** false under reduced motion: fragments sit still */
  loose?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (n: string) => `nf-${uid}-${n}`;
  const cell = Math.max(1, Math.floor((size * 0.75) / 16));
  const gp = cell * 16;
  const off = Math.round((size - gp) / 2);
  const shape = squircle(size);
  const rim = squircle(size, 0.5);
  const accent = C.flare;

  return (
    <span className="app-nf-icon" style={{ width: size, height: size }} aria-hidden>
      <span className="app-nf-icon-tile" style={{ borderRadius: size * 0.24 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} focusable="false">
          <defs>
            <linearGradient id={id("bg")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a2b3f" />
              <stop offset="1" stopColor="#140f18" />
            </linearGradient>
            <radialGradient id={id("glow")} cx="0.5" cy="1.12" r="0.78">
              <stop offset="0" stopColor={accent} stopOpacity="0.34" />
              <stop offset="0.6" stopColor={accent} stopOpacity="0.1" />
              <stop offset="1" stopColor={accent} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={id("spec")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="0.4" stopColor="#fff" stopOpacity="0.035" />
              <stop offset="0.62" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="0.22" stopColor="#fff" stopOpacity="0.13" />
              <stop offset="0.65" stopColor="#fff" stopOpacity="0.03" />
              <stop offset="1" stopColor={accent} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path d={shape} fill={`url(#${id("bg")})`} />
          <path d={shape} fill={`url(#${id("glow")})`} />
          <svg x={off} y={off} width={gp} height={gp} viewBox="0 0 16 16" shapeRendering="crispEdges" overflow="visible">
            <g fill={C.ink950} opacity={0.42}>
              {GLYPH.shadow.map((r) => (
                <rect key={`s${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} />
              ))}
            </g>
            {GLYPH.runs.map((r) => (
              <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
            ))}
          </svg>
          <path d={shape} fill={`url(#${id("spec")})`} />
          <path d={rim} fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1" />
        </svg>
      </span>
      {FRAGMENTS.map((f, i) =>
        loose ? (
          <Fragment key={i} frag={f} cell={cell} off={off} ox={ox} oy={oy} />
        ) : (
          <span
            key={i}
            aria-hidden
            className="app-nf-frag"
            style={{
              left: off + f.x * cell,
              top: off + f.y * cell,
              width: f.w * cell,
              height: f.h * cell,
              background: f.fill,
            }}
          />
        )
      )}
    </span>
  );
}
