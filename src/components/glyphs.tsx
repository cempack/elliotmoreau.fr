"use client";

import { pxPath } from "@/lib/pxpath";

/** 7x7 pixel icon cells, drawn cell by cell like the home link cards. */
export type Cells = [number, number][];

export const GLYPH_TERM: Cells = [
  [1, 0], [2, 1], [3, 2], [2, 3], [1, 4], [1, 6], [2, 6], [3, 6], [4, 6],
];
export const GLYPH_MAIL: Cells = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
  [0, 1], [6, 1], [1, 1], [5, 1],
  [0, 2], [6, 2], [2, 2], [4, 2],
  [0, 3], [6, 3], [3, 3],
  [0, 4], [6, 4], [0, 5], [6, 5],
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6],
];
export const GLYPH_STAR: Cells = [
  [3, 0],
  [3, 1], [2, 2], [3, 2], [4, 2],
  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
  [2, 4], [3, 4], [4, 4],
  [2, 5], [4, 5],
  [1, 6], [5, 6],
];
export const GLYPH_NOTE: Cells = [
  [3, 0], [4, 0], [5, 0],
  [5, 1], [5, 2], [5, 3], [5, 4],
  [4, 4], [3, 4], [2, 4],
  [1, 4], [1, 5], [1, 6], [2, 6], [3, 6], [3, 5],
];
export const GLYPH_PIN: Cells = [
  [2, 0], [3, 0], [4, 0],
  [2, 1], [3, 1], [4, 1],
  [2, 2], [3, 2], [4, 2],
  [3, 3], [3, 4], [3, 5],
  [2, 6], [3, 6], [4, 6],
];
export const GLYPH_CODE: Cells = [
  [2, 1], [1, 2], [0, 3], [1, 4], [2, 5],
  [4, 1], [5, 2], [6, 3], [5, 4], [4, 5],
  [3, 0], [3, 2], [3, 4], [3, 6],
];
export const GLYPH_PLAY: Cells = [
  [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6],
  [2, 1], [2, 5], [3, 2], [3, 4], [4, 3],
];
export const GLYPH_CHAT: Cells = [
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
  [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4],
  [2, 5], [2, 6],
];
export const GLYPH_X: Cells = [
  [0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6],
  [6, 0], [5, 1], [4, 2], [2, 4], [1, 5], [0, 6],
];
export const GLYPH_COIN: Cells = [
  [2, 0], [3, 0], [4, 0],
  [1, 1], [5, 1],
  [1, 2], [3, 2], [5, 2],
  [1, 3], [3, 3], [5, 3],
  [1, 4], [3, 4], [5, 4],
  [1, 5], [5, 5],
  [2, 6], [3, 6], [4, 6],
];
export const GLYPH_HOME: Cells = [
  [1, 3], [2, 2], [3, 1], [4, 2], [5, 3],
  [0, 3], [6, 3],
  [1, 4], [1, 5], [1, 6], [5, 4], [5, 5], [5, 6],
  [2, 6], [3, 6], [4, 6],
  [3, 4], [3, 5],
];
export const GLYPH_BOLT: Cells = [
  [4, 0], [3, 1], [3, 2], [2, 3], [2, 4], [1, 5], [4, 3], [3, 4], [3, 5], [2, 6], [4, 6],
];

export function PixelGlyph({
  cells,
  className = "",
  size = 21,
}: {
  cells: Cells;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d={pxPath(cells.map(([x, y]) => ({ x, y })), 0.02)} />
    </svg>
  );
}

/** Twinkling corner sparkles for hoverable cards (parent needs `group`). */
export function CardSparkles() {
  return (
    <>
      <span className="pixel-spark absolute -top-1 right-8 h-1.5 w-1.5 bg-ember" aria-hidden />
      <span className="pixel-spark d2 absolute right-0 top-3 h-1 w-1 bg-glacier" aria-hidden />
    </>
  );
}
