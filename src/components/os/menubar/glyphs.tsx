"use client";

import { pxPath } from "@/lib/pxpath";

import type { SkyMode } from "../sky";

/**
 * The menu bar's pixel vocabulary: the emOS mark, the pixel equalizer,
 * sky-phase glyphs, and the few hairline icons the bar needs. Every pixel
 * shape is a cell map rendered as crisp SVG rects (shapeRendering
 * crispEdges), sized in whole multiples of its grid so cells never blur.
 */

type Cells = readonly (readonly [number, number])[];

/** Parse a row-string bitmap ("#" = on) into cells. */
function bitmap(rows: string[]): Cells {
  const out: [number, number][] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === "#") out.push([x, y]);
  });
  return out;
}

/**
 * emOS mark: a 9×9 pixel tile with corners knocked off and a lowercase
 * "e" cut out of it, so the ink behind shows through the letter. Lime,
 * the brand colour, is the tile; the letter is the void.
 */
const MARK_E = bitmap([
  ".........",
  ".........",
  "...###...",
  "..#...#..",
  "..#####..",
  "..#......",
  "...####..",
  ".........",
  ".........",
]);
const MARK_TILE = (() => {
  const e = new Set(MARK_E.map(([x, y]) => `${x},${y}`));
  const out: [number, number][] = [];
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) {
      const corner = (x === 0 || x === 8) && (y === 0 || y === 8);
      if (!corner && !e.has(`${x},${y}`)) out.push([x, y]);
    }
  return out;
})();

export function EmosMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 9 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g fill="currentColor">
        <path d={pxPath(MARK_TILE.map(([x, y]) => ({ x, y })), 0.02)} />
      </g>
    </svg>
  );
}

export function Pixels({
  cells,
  w = 7,
  h = 7,
  size = 14,
  className = "",
}: {
  cells: Cells;
  w?: number;
  h?: number;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={(size * w) / h}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d={pxPath(cells.map(([x, y]) => ({ x, y })), 0.02)} />
    </svg>
  );
}

/* 7×7 sky glyphs for the segmented control and the time card */
export const GLYPH_LIVE = bitmap([
  "..###..",
  ".#...#.",
  "#..#..#",
  "#..##.#",
  "#.....#",
  ".#...#.",
  "..###..",
]);
export const GLYPH_DAWN = bitmap([
  ".......",
  "...#...",
  ".#...#.",
  "...#...",
  "..###..",
  "#######",
  ".......",
]);
export const GLYPH_DAY = bitmap([
  "...#...",
  ".#...#.",
  "..###..",
  "#.###.#",
  "..###..",
  ".#...#.",
  "...#...",
]);
export const GLYPH_DUSK = bitmap([
  ".......",
  ".......",
  ".#...#.",
  "..###..",
  ".#####.",
  "#######",
  ".......",
]);
export const GLYPH_NIGHT = bitmap([
  "..###..",
  ".###...",
  "###....",
  "###....",
  "###...#",
  ".###.#.",
  "..###..",
]);
export const GLYPH_MOON = GLYPH_NIGHT;

export const SKY_GLYPH: Record<SkyMode, Cells> = {
  auto: GLYPH_LIVE,
  dawn: GLYPH_DAWN,
  day: GLYPH_DAY,
  dusk: GLYPH_DUSK,
  night: GLYPH_NIGHT,
};

/* 7×7 app glyphs for notification cards and toasts */
export const GLYPH_COMMIT = bitmap([
  "...#...",
  "...#...",
  "..###..",
  "###.###",
  "..###..",
  "...#...",
  "...#...",
]);
export const GLYPH_PAGE = bitmap([
  "#####..",
  "#...##.",
  "#.....#",
  "#.###.#",
  "#.....#",
  "#.###.#",
  "#######",
]);
export const GLYPH_NOTE = bitmap([
  "..####.",
  "..#..#.",
  "..#..#.",
  "..#..#.",
  "###.##.",
  "###.##.",
  ".......",
]);
export const GLYPH_SPEAKER = bitmap([
  "...#...",
  "..##.#.",
  "####..#",
  "####..#",
  "####..#",
  "..##.#.",
  "...#...",
]);
export const GLYPH_MUTE = bitmap([
  "...#...",
  "..##...",
  "####.#.",
  "####..#",
  "####.#.",
  "..##...",
  "...#...",
]);

/**
 * Pixel equalizer: four columns of 2px blocks on a 3px pitch. Each column
 * jumps a whole block at a time (stepped transform keyframes, compositor
 * only). Frozen to a flat line unless something is actually playing; a
 * static skyline under reduced motion.
 */
export function PixelEq({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <span className={`os-menubar-eq ${className}`} data-playing={playing || undefined} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/* hairline icons (16px grid, 1.5 stroke) */
export function SearchIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.6" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Control Center: two stacked switches, knobs on opposite sides. */
export function ControlIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <rect x="1.75" y="2.75" width="12.5" height="4.5" rx="2.25" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.75" cy="5" r="1.4" fill="currentColor" />
      <rect x="1.75" y="8.75" width="12.5" height="4.5" rx="2.25" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.25" cy="11" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ArrowUpRight({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden focusable="false">
      <path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRight({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden focusable="false">
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RestartIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M13.25 8.5A5.25 5.25 0 1 1 11.6 4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12.25 1.75v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** the four corners, out: full screen; in: back to the window */
export function FullscreenIcon({ exit = false, size = 14 }: { exit?: boolean; size?: number }) {
  const d = exit
    ? "M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5"
    : "M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PowerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path d="M8 2.25v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 4.2a5.25 5.25 0 1 0 6.8 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
